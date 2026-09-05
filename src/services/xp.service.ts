import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { XP_REWARDS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  discordId: string | null;
  totalXp: number;
  currentTier: number;
  streakCount: number;
}

export class XpService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  /**
   * Appends an event to the immutable XP ledger.
   * Total XP is always derived, never a mutable counter.
   */
  async awardXp(
    userId: string,
    amount: number,
    reason: string,
    refType?: string,
    refId?: string
  ): Promise<number> {
    await this.db.xpEvent.create({
      data: {
        userId,
        amount,
        reason,
        refType,
        refId,
      },
    });

    const newTotal = await this.getUserTotalXp(userId);
    logger.info({ userId, amount, reason, newTotal }, 'XP awarded to student');
    return newTotal;
  }

  /**
   * Derives total XP via SQL SUM aggregation
   */
  async getUserTotalXp(userId: string): Promise<number> {
    const aggregate = await this.db.xpEvent.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return aggregate._sum.amount || 0;
  }

  /**
   * Updates streak count when a qualifying learning action occurs (video watch, quiz, project submission).
   */
  async recordActivity(userId: string): Promise<{ streakCount: number; streakExtended: boolean }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { streakCount: true, streakLastDate: true },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const now = new Date();
    const lastDate = user.streakLastDate;

    let streakCount = user.streakCount;
    let streakExtended = false;

    if (!lastDate) {
      streakCount = 1;
      streakExtended = true;
    } else {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / msPerDay);

      if (daysDiff === 1) {
        // Consecutive day
        streakCount += 1;
        streakExtended = true;
      } else if (daysDiff > 1) {
        // Streak broken
        streakCount = 1;
        streakExtended = true;
      }
      // If daysDiff === 0, activity was already recorded today
    }

    if (streakExtended) {
      await this.db.user.update({
        where: { id: userId },
        data: {
          streakCount,
          streakLastDate: now,
        },
      });

      // Award daily streak XP
      await this.awardXp(
        userId,
        XP_REWARDS.DAILY_ACTIVITY_STREAK,
        `Daily learning streak maintained: ${streakCount} day(s)`,
        'streak'
      );
    }

    return { streakCount, streakExtended };
  }

  /**
   * Evaluates milestone achievements and unlocks newly earned badges
   */
  async evaluateAchievements(userId: string): Promise<string[]> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        lessonProgress: { where: { completed: true } },
        achievements: { include: { achievement: true } },
      },
    });

    if (!user) return [];

    const existingKeys = new Set(user.achievements.map(a => a.achievement.key));
    const newlyUnlocked: string[] = [];

    const totalLessons = user.lessonProgress.length;
    const streak = user.streakCount;

    const milestones = [
      { key: 'FIRST_LESSON', condition: totalLessons >= 1, name: 'First Steps', desc: 'Completed your first lesson' },
      { key: 'LESSONS_10', condition: totalLessons >= 10, name: 'Knowledge Seeker', desc: 'Completed 10 lessons' },
      { key: 'LESSONS_25', condition: totalLessons >= 25, name: 'Master in the Making', desc: 'Completed 25 lessons' },
      { key: 'STREAK_7', condition: streak >= 7, name: 'Week Warrior', desc: 'Maintained a 7-day learning streak' },
      { key: 'STREAK_30', condition: streak >= 30, name: 'Iron Discipline', desc: 'Maintained a 30-day learning streak' },
    ];

    for (const m of milestones) {
      if (m.condition && !existingKeys.has(m.key)) {
        // Ensure achievement definition exists
        const achievement = await this.db.achievement.upsert({
          where: { key: m.key },
          create: {
            key: m.key,
            name: m.name,
            description: m.desc,
            icon: '🏅',
            requirementType: 'milestone',
            requirementValue: 1,
          },
          update: {},
        });

        await this.db.achievementUnlock.create({
          data: {
            userId,
            achievementId: achievement.id,
          },
        });

        newlyUnlocked.push(m.name);
        logger.info({ userId, achievementKey: m.key }, 'Achievement unlocked');
      }
    }

    return newlyUnlocked;
  }

  /**
   * Fetches the academy leaderboard with privacy opt-out filter
   */
  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const users = await this.db.user.findMany({
      where: { leaderboardOptOut: false },
      include: {
        xpEvents: {
          select: { amount: true },
        },
      },
    });

    const ranked = users
      .map(u => ({
        userId: u.id,
        discordId: u.discordId,
        currentTier: u.currentTier,
        streakCount: u.streakCount,
        totalXp: u.xpEvents.reduce((acc, curr) => acc + curr.amount, 0),
      }))
      .sort((a, b) => b.totalXp - a.totalXp)
      .slice(0, limit)
      .map((entry, idx) => ({
        rank: idx + 1,
        ...entry,
      }));

    return ranked;
  }
}

export const xpService = new XpService();
