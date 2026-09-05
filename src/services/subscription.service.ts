import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { auditService, AuditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import type Stripe from 'stripe';

export interface ProcessSubscriptionParams {
  providerRef: string;
  email: string;
  plan: string;
  status: SubscriptionStatus;
  startedAt: Date;
  expiresAt: Date | null;
  cancelledAt?: Date | null;
}

export class SubscriptionService {
  constructor(
    private db: PrismaClient = defaultPrisma,
    private auditor: AuditService = auditService
  ) {}

  /**
   * Translates Stripe subscription status string into the Academy SubscriptionStatus enum
   */
  mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
      case 'trialing':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
      case 'unpaid':
        return SubscriptionStatus.CANCELLED;
      case 'incomplete':
      case 'incomplete_expired':
      case 'paused':
      default:
        return SubscriptionStatus.PENDING;
    }
  }

  /**
   * Processes a verified webhook subscription payload and updates the database.
   * Never derives subscription state from Discord claims.
   */
  async handleSubscriptionUpdated(params: ProcessSubscriptionParams): Promise<{ userId: string; status: SubscriptionStatus }> {
    // Find user by email or existing subscription
    let user = await this.db.user.findFirst({
      where: {
        OR: [
          { email: params.email },
          { subscriptions: { some: { providerRef: params.providerRef } } },
        ],
      },
      include: { subscriptions: true },
    });

    if (!user) {
      // Create student user record if first-time purchase
      user = await this.db.user.create({
        data: {
          email: params.email,
          accountId: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          subscriptionStatus: params.status,
          subscriptionExpiresAt: params.expiresAt,
          currentTier: 1,
        },
        include: { subscriptions: true },
      });

      logger.info({ userId: user.id, email: params.email }, 'Created new student user record from verified payment');
    }

    const previousStatus = user.subscriptionStatus;

    // Update user subscription state
    await this.db.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: params.status,
        subscriptionExpiresAt: params.expiresAt,
      },
    });

    // Upsert subscription record
    await this.db.subscription.upsert({
      where: { providerRef: params.providerRef },
      create: {
        userId: user.id,
        plan: params.plan,
        status: params.status,
        providerRef: params.providerRef,
        startedAt: params.startedAt,
        expiresAt: params.expiresAt,
        cancelledAt: params.cancelledAt,
        renewedAt: params.status === SubscriptionStatus.ACTIVE && previousStatus !== SubscriptionStatus.ACTIVE ? new Date() : null,
      },
      update: {
        plan: params.plan,
        status: params.status,
        expiresAt: params.expiresAt,
        cancelledAt: params.cancelledAt,
        renewedAt: params.status === SubscriptionStatus.ACTIVE && previousStatus !== SubscriptionStatus.ACTIVE ? new Date() : undefined,
      },
    });

    // Record immutable audit entry
    await this.auditor.log({
      actorType: 'SYSTEM',
      actorId: 'STRIPE_WEBHOOK',
      action: 'SUBSCRIPTION_STATE_CHANGED',
      targetType: 'USER',
      targetId: user.id,
      reason: `Webhook received for providerRef ${params.providerRef}. Status transition: ${previousStatus} -> ${params.status}`,
      before: { status: previousStatus },
      after: { status: params.status, expiresAt: params.expiresAt },
    });

    logger.info(
      { userId: user.id, providerRef: params.providerRef, from: previousStatus, to: params.status },
      'Updated student subscription state'
    );

    return { userId: user.id, status: params.status };
  }

  /**
   * Sweeps expired subscriptions where expiresAt has passed.
   * Critical guarantee: Never deletes lesson_progress, quiz_attempts, XP events, streaks, or achievements!
   */
  async sweepExpiredSubscriptions(): Promise<string[]> {
    const now = new Date();
    const expiredUsers = await this.db.user.findMany({
      where: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: {
          not: null,
          lte: now,
        },
      },
    });

    const expiredUserIds: string[] = [];

    for (const user of expiredUsers) {
      await this.db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
      });

      await this.db.subscription.updateMany({
        where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      await this.auditor.log({
        actorType: 'SYSTEM',
        actorId: 'EXPIRY_SWEEP_JOB',
        action: 'SUBSCRIPTION_EXPIRED',
        targetType: 'USER',
        targetId: user.id,
        reason: `Subscription expiration timestamp (${user.subscriptionExpiresAt?.toISOString()}) elapsed. Progress rows preserved.`,
        before: { status: SubscriptionStatus.ACTIVE },
        after: { status: SubscriptionStatus.EXPIRED },
      });

      expiredUserIds.push(user.id);
    }

    if (expiredUserIds.length > 0) {
      logger.info({ count: expiredUserIds.length }, 'Expired subscriptions swept. Student progress preserved.');
    }

    return expiredUserIds;
  }

  /**
   * Finds users whose subscriptions expire within a given window (e.g. 7 days, 3 days, 24 hours)
   * for throttled notifications.
   */
  async findExpiringUsers(withinHours: number): Promise<Array<{ id: string; discordId: string | null; email: string; expiresAt: Date }>> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    const users = await this.db.user.findMany({
      where: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: {
          gt: now,
          lte: windowEnd,
        },
      },
      select: {
        id: true,
        discordId: true,
        email: true,
        subscriptionExpiresAt: true,
      },
    });

    return users.map(u => ({
      id: u.id,
      discordId: u.discordId,
      email: u.email,
      expiresAt: u.subscriptionExpiresAt!,
    }));
  }
}

export const subscriptionService = new SubscriptionService();
