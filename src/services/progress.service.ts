import { PrismaClient, AssignmentStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { COMPLETION_THRESHOLDS, XP_REWARDS } from '../config/constants.js';
import { xpService } from './xp.service.js';
import { tierEngine } from './tier-engine.service.js';
import { logger } from '../utils/logger.js';

export interface CompletionResult {
  lessonId: string;
  userId: string;
  completed: boolean;
  videoCompleted: boolean;
  quizPassed: boolean;
  assignmentApproved: boolean;
  newlyCompleted: boolean;
  xpAwarded: number;
  tierUnlocked?: number;
}

export class ProgressService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  /**
   * Records video watch percentage reported directly from the course website video player.
   * Discord presentation layer NEVER guesses or mocks video watch percentage.
   */
  async updateWatchProgress(
    userId: string,
    lessonId: string,
    watchPercent: number
  ): Promise<CompletionResult> {
    const videoCompleted = watchPercent >= COMPLETION_THRESHOLDS.VIDEO_WATCH_PERCENT;

    const progress = await this.db.lessonProgress.upsert({
      where: {
        userId_lessonId: { userId, lessonId },
      },
      create: {
        userId,
        lessonId,
        watchPercent,
        videoCompleted,
      },
      update: {
        watchPercent: Math.max(watchPercent, 0),
        videoCompleted: videoCompleted ? true : undefined,
      },
    });

    return this.evaluateLessonCompletion(userId, lessonId);
  }

  /**
   * Central rule check for lesson completion: video + quiz + assignment.
   */
  async evaluateLessonCompletion(userId: string, lessonId: string): Promise<CompletionResult> {
    const lesson = await this.db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        quiz: true,
        assignment: true,
      },
    });

    if (!lesson) {
      throw new Error(`Lesson ${lessonId} not found`);
    }

    const progress = await this.db.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    const videoCompleted = progress?.videoCompleted ?? false;
    let quizPassed = true;
    let assignmentApproved = true;

    // 1. Check Quiz Requirement
    if (lesson.requiresQuiz && lesson.quiz) {
      const passingAttempt = await this.db.quizAttempt.findFirst({
        where: {
          userId,
          quizId: lesson.quiz.id,
          passed: true,
        },
      });
      quizPassed = Boolean(passingAttempt);
    }

    // 2. Check Assignment Requirement
    if (lesson.requiresAssignment && lesson.assignment) {
      const approvedSubmission = await this.db.assignmentSubmission.findFirst({
        where: {
          userId,
          assignmentId: lesson.assignment.id,
          status: AssignmentStatus.APPROVED,
        },
      });
      assignmentApproved = Boolean(approvedSubmission);
    }

    const meetsAllConditions = videoCompleted && quizPassed && assignmentApproved;
    const wasAlreadyCompleted = progress?.completed ?? false;
    let newlyCompleted = false;
    let xpAwarded = 0;
    let tierUnlocked: number | undefined;

    if (meetsAllConditions && !wasAlreadyCompleted) {
      // Mark complete in database
      await this.db.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: {
          userId,
          lessonId,
          watchPercent: 100,
          videoCompleted: true,
          completed: true,
          completedAt: new Date(),
        },
        update: {
          completed: true,
          completedAt: new Date(),
        },
      });

      newlyCompleted = true;

      // Award XP for lesson completion
      await xpService.awardXp(
        userId,
        XP_REWARDS.LESSON_COMPLETED,
        `Completed Lesson: ${lesson.title}`,
        'lesson',
        lessonId
      );
      xpAwarded += XP_REWARDS.LESSON_COMPLETED;

      // Extend learning streak
      await xpService.recordActivity(userId);

      // Evaluate achievements
      await xpService.evaluateAchievements(userId);

      // Evaluate tier progression
      const tierResult = await tierEngine.evaluateTier(userId);
      if (tierResult.unlocked) {
        tierUnlocked = tierResult.eligibleTier;
      }

      logger.info({ userId, lessonId, title: lesson.title }, 'Lesson completed successfully');
    }

    return {
      lessonId,
      userId,
      completed: meetsAllConditions,
      videoCompleted,
      quizPassed,
      assignmentApproved,
      newlyCompleted,
      xpAwarded,
      tierUnlocked,
    };
  }

  /**
   * Retrieves overall course progress for a user across all tiers
   */
  async getUserProgressSummary(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        lessonProgress: {
          include: { lesson: true },
        },
        projectSubmissions: true,
      },
    });

    if (!user) throw new Error(`User ${userId} not found`);

    const allLessons = await this.db.lesson.findMany({
      orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
    });

    const completedLessonIds = new Set(
      user.lessonProgress.filter(p => p.completed).map(p => p.lessonId)
    );

    const tierStats = [1, 2, 3].map(tier => {
      const tierLessons = allLessons.filter(l => l.tier === tier);
      const completed = tierLessons.filter(l => completedLessonIds.has(l.id)).length;
      const percentage = tierLessons.length > 0 ? Math.round((completed / tierLessons.length) * 100) : 0;
      return {
        tier,
        totalLessons: tierLessons.length,
        completedLessons: completed,
        percentage,
      };
    });

    const totalLessons = allLessons.length;
    const totalCompleted = completedLessonIds.size;
    const overallPercentage = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;
    const totalXp = await xpService.getUserTotalXp(userId);

    return {
      userId,
      discordId: user.discordId,
      currentTier: user.currentTier,
      totalXp,
      streakCount: user.streakCount,
      overallPercentage,
      totalLessons,
      totalCompleted,
      tierStats,
    };
  }
}

export const progressService = new ProgressService();
