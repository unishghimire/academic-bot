import { describe, it, expect, vi } from 'vitest';
import { TierEngineService } from '../src/services/tier-engine.service.js';
import { SubscriptionStatus, ProjectStatus } from '@prisma/client';

describe('TierEngineService — Central Rule Evaluator', () => {
  it('locks all tiers when subscription is inactive or pending', async () => {
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user_1',
          subscriptionStatus: SubscriptionStatus.PENDING,
          currentTier: 1,
          lessonProgress: [],
          projectSubmissions: [],
        }),
      },
      lesson: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const engine = new TierEngineService(mockDb);
    const result = await engine.evaluateTier('user_1');

    expect(result.activeSubscription).toBe(false);
    expect(result.eligibleTier).toBe(0);
    expect(result.unlocked).toBe(false);
  });

  it('grants Tier 1 immediately when subscription is ACTIVE', async () => {
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user_1',
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentTier: 1,
          lessonProgress: [],
          projectSubmissions: [],
        }),
      },
      lesson: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'l1', tier: 1, module: 1, orderIndex: 1 },
          { id: 'l2', tier: 1, module: 1, orderIndex: 2 },
        ]),
      },
    };

    const engine = new TierEngineService(mockDb);
    const result = await engine.evaluateTier('user_1');

    expect(result.activeSubscription).toBe(true);
    expect(result.eligibleTier).toBe(1);
    expect(result.tier1Progress.complete).toBe(false);
  });

  it('maintains Elite tier access for active subscribers regardless of lesson count', async () => {
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user_1',
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentTier: 1,
          lessonProgress: [
            { lessonId: 'l1', completed: true },
            { lessonId: 'l2', completed: true },
          ],
        }),
      },
    };

    const engine = new TierEngineService(mockDb);
    const result = await engine.evaluateTier('user_1');

    expect(result.activeSubscription).toBe(true);
    expect(result.eligibleTier).toBe(1);
    expect(result.tier1Progress.completedLessons).toBe(2);
  });

  it('enforces mandatory reason parameter for admin tier overrides', async () => {
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user_1', currentTier: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const mockAuditor: any = { log: vi.fn().mockResolvedValue({ id: 'audit_1' }) };
    const engine = new TierEngineService(mockDb, mockAuditor);

    // Should throw if reason is missing or empty
    await expect(engine.applyAdminOverride('user_1', 3, 'admin_123', '')).rejects.toThrow(
      'Mandatory reason parameter is required'
    );

    // Should succeed with audit log entry when reason is provided
    await engine.applyAdminOverride('user_1', 3, 'admin_123', 'Scholarship granted');
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { currentTier: 3 },
    });
    expect(mockAuditor.log).toHaveBeenCalled();
  });
});
