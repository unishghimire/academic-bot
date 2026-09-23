import { PrismaClient, SubscriptionStatus } from '@prisma/client';
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
   * Evaluates membership access for a user.
   * In the single Elite role model, all active subscriptions grant Elite access (1).
   * Multi-tier ladder progression has been removed.
   */
  async evaluateTier(userId: string): Promise<TierEvaluationResult> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: {
        lessonProgress: true,
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const isActive = user.subscriptionStatus === SubscriptionStatus.ACTIVE;
    const eligibleTier = isActive ? TIER_LEVELS.ELITE : 0;
    const previousTier = user.currentTier;

    let unlocked = false;
    if (isActive && previousTier < TIER_LEVELS.ELITE) {
      await this.db.user.update({
        where: { id: userId },
        data: { currentTier: TIER_LEVELS.ELITE },
      });
      unlocked = true;
      logger.info({ userId, newTier: TIER_LEVELS.ELITE }, 'Elite membership tier active');
    }

    const completedLessons = user.lessonProgress.filter(lp => lp.completed).length;

    return {
      userId,
      previousTier,
      eligibleTier,
      unlocked,
      activeSubscription: isActive,
      tier1Progress: {
        totalLessons: 0,
        completedLessons,
        projectApproved: true,
        complete: false,
      },
      tier2Progress: {
        totalLessons: 0,
        completedLessons: 0,
        projectApproved: true,
        complete: false,
      },
      tier3Progress: {
        totalLessons: 0,
        completedLessons: 0,
        complete: false,
      },
    };
  }

  /**
   * Admin tier override stub (audited)
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
