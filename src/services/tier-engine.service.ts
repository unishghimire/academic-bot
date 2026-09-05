import { PrismaClient, SubscriptionStatus, ProjectStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { auditService, AuditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { TIER_LEVELS } from '../config/constants.js';

export interface TierEvaluationResult {
  userId: string;
  previousTier: number;
  eligibleTier: number;
  unlocked: boolean;
  activeSubscription: boolean;
  tier1Progress: {
    totalLessons: number;
    completedLessons: number;
    projectApproved: boolean;
    complete: boolean;
  };
  tier2Progress: {
    totalLessons: number;
    completedLessons: number;
    projectApproved: boolean;
    complete: boolean;
  };
  tier3Progress: {
    totalLessons: number;
    completedLessons: number;
    complete: boolean;
  };
}

export class TierEngineService {
  constructor(
    private db: PrismaClient = defaultPrisma,
    private auditor: AuditService = auditService
  ) {}

  /**
   * Evaluates tier progression for a user based on active database records.
   * This central rule evaluator is the ONLY code path allowed to calculate tier access.
   */
  async evaluateTier(userId: string): Promise<TierEvaluationResult> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        lessonProgress: {
          include: { lesson: true },
        },
        projectSubmissions: {
          include: { project: true },
        },
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const isActive = user.subscriptionStatus === SubscriptionStatus.ACTIVE;

    // Fetch all lessons in catalog by tier
    const allLessons = await this.db.lesson.findMany({
      orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
    });

    const tier1Lessons = allLessons.filter(l => l.tier === TIER_LEVELS.TIER_1);
    const tier2Lessons = allLessons.filter(l => l.tier === TIER_LEVELS.TIER_2);
    const tier3Lessons = allLessons.filter(l => l.tier === TIER_LEVELS.TIER_3);

    // Check lesson completion status for each tier
    const completedLessonIds = new Set(
      user.lessonProgress.filter(lp => lp.completed).map(lp => lp.lessonId)
    );

    const tier1CompletedCount = tier1Lessons.filter(l => completedLessonIds.has(l.id)).length;
    const tier2CompletedCount = tier2Lessons.filter(l => completedLessonIds.has(l.id)).length;
    const tier3CompletedCount = tier3Lessons.filter(l => completedLessonIds.has(l.id)).length;

    // Check tier final project approvals
    const approvedProjects = new Set(
      user.projectSubmissions
        .filter(ps => ps.status === ProjectStatus.APPROVED)
        .map(ps => ps.project.tier)
    );

    const tier1ProjectApproved = approvedProjects.has(TIER_LEVELS.TIER_1);
    const tier2ProjectApproved = approvedProjects.has(TIER_LEVELS.TIER_2);

    const tier1Complete =
      tier1Lessons.length > 0 &&
      tier1CompletedCount === tier1Lessons.length &&
      tier1ProjectApproved;

    const tier2Complete =
      tier1Complete &&
      tier2Lessons.length > 0 &&
      tier2CompletedCount === tier2Lessons.length &&
      tier2ProjectApproved;

    const tier3Complete =
      tier2Complete &&
      tier3Lessons.length > 0 &&
      tier3CompletedCount === tier3Lessons.length;

    // Determine eligible tier
    let eligibleTier = 0;
    if (isActive) {
      eligibleTier = TIER_LEVELS.TIER_1; // Tier 1 unlocked with active subscription
      if (tier1Complete) {
        eligibleTier = TIER_LEVELS.TIER_2;
      }
      if (tier2Complete) {
        eligibleTier = TIER_LEVELS.TIER_3;
      }
      if (tier3Complete) {
        eligibleTier = TIER_LEVELS.GRADUATE;
      }
    }

    const previousTier = user.currentTier;
    let unlocked = false;

    // If eligible tier increased, advance the student in the database
    if (eligibleTier > previousTier) {
      await this.db.user.update({
        where: { id: userId },
        data: { currentTier: eligibleTier },
      });

      await this.auditor.log({
        actorType: 'SYSTEM',
        actorId: 'TIER_ENGINE',
        action: 'TIER_PROGRESSION_UNLOCKED',
        targetType: 'USER',
        targetId: userId,
        reason: `Student completed tier prerequisites. Advanced from Tier ${previousTier} to Tier ${eligibleTier}.`,
        before: { currentTier: previousTier },
        after: { currentTier: eligibleTier },
      });

      unlocked = true;
      logger.info({ userId, previousTier, newTier: eligibleTier }, 'Tier advancement unlocked');
    }

    return {
      userId,
      previousTier,
      eligibleTier,
      unlocked,
      activeSubscription: isActive,
      tier1Progress: {
        totalLessons: tier1Lessons.length,
        completedLessons: tier1CompletedCount,
        projectApproved: tier1ProjectApproved,
        complete: tier1Complete,
      },
      tier2Progress: {
        totalLessons: tier2Lessons.length,
        completedLessons: tier2CompletedCount,
        projectApproved: tier2ProjectApproved,
        complete: tier2Complete,
      },
      tier3Progress: {
        totalLessons: tier3Lessons.length,
        completedLessons: tier3CompletedCount,
        complete: tier3Complete,
      },
    };
  }

  /**
   * Handles admin overrides by recording an exception in the audit log and forcing a tier update
   */
  async applyAdminOverride(
    userId: string,
    targetTier: number,
    adminId: string,
    reason: string
  ): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Mandatory reason parameter is required for admin tier unlock');
    }

    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    await this.db.user.update({
      where: { id: userId },
      data: { currentTier: targetTier },
    });

    await this.auditor.log({
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'ADMIN_TIER_OVERRIDE',
      targetType: 'USER',
      targetId: userId,
      reason,
      before: { currentTier: user.currentTier },
      after: { currentTier: targetTier },
    });

    logger.warn(
      { userId, adminId, previousTier: user.currentTier, targetTier, reason },
      'Admin tier override applied'
    );
  }
}

export const tierEngine = new TierEngineService();
