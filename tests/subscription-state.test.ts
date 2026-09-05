import { describe, it, expect, vi } from 'vitest';
import { SubscriptionService } from '../src/services/subscription.service.js';
import { SubscriptionStatus } from '@prisma/client';

describe('SubscriptionService — Lifecycle & Webhook Processing', () => {
  it('correctly maps Stripe subscription statuses to Academy enums', () => {
    const service = new SubscriptionService({} as any);

    expect(service.mapStripeStatus('active')).toBe(SubscriptionStatus.ACTIVE);
    expect(service.mapStripeStatus('trialing')).toBe(SubscriptionStatus.ACTIVE);
    expect(service.mapStripeStatus('past_due')).toBe(SubscriptionStatus.PAST_DUE);
    expect(service.mapStripeStatus('canceled')).toBe(SubscriptionStatus.CANCELLED);
    expect(service.mapStripeStatus('unpaid')).toBe(SubscriptionStatus.CANCELLED);
    expect(service.mapStripeStatus('incomplete')).toBe(SubscriptionStatus.PENDING);
  });

  it('updates subscription to ACTIVE upon verified Stripe webhook', async () => {
    const mockDb: any = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'u_100',
          email: 'student@example.com',
          subscriptionStatus: SubscriptionStatus.PENDING,
          subscriptions: [],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      subscription: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const mockAuditor: any = { log: vi.fn().mockResolvedValue({ id: 'audit_1' }) };

    const service = new SubscriptionService(mockDb, mockAuditor);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const result = await service.handleSubscriptionUpdated({
      providerRef: 'sub_stripe_123',
      email: 'student@example.com',
      plan: 'premium_monthly',
      status: SubscriptionStatus.ACTIVE,
      startedAt: new Date(),
      expiresAt,
    });

    expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u_100' },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: expiresAt,
      },
    });
    expect(mockAuditor.log).toHaveBeenCalled();
  });

  it('sweeps expired subscriptions without modifying progress or XP tables', async () => {
    const pastDate = new Date(Date.now() - 1000);
    const mockDb: any = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'u_expired', subscriptionExpiresAt: pastDate, subscriptionStatus: SubscriptionStatus.ACTIVE },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      subscription: {
        updateMany: vi.fn().mockResolvedValue({}),
      },
    };
    const mockAuditor: any = { log: vi.fn().mockResolvedValue({ id: 'audit_1' }) };

    const service = new SubscriptionService(mockDb, mockAuditor);
    const swept = await service.sweepExpiredSubscriptions();

    expect(swept).toContain('u_expired');
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u_expired' },
      data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
    });
    expect(mockAuditor.log).toHaveBeenCalled();
    // Critical architecture invariant: lessonProgress and xpEvent must NOT be deleted or mutated!
    expect(mockDb.lessonProgress).toBeUndefined();
    expect(mockDb.xpEvent).toBeUndefined();
  });
});
