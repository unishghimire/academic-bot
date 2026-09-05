import { describe, it, expect, vi } from 'vitest';
import { XpService } from '../src/services/xp.service.js';
import { XP_REWARDS } from '../src/config/constants.js';

describe('XpService — Append-Only Ledger & Streaks', () => {
  it('appends XP event and derives total from aggregation', async () => {
    const mockDb: any = {
      xpEvent: {
        create: vi.fn().mockResolvedValue({}),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 350 } }),
      },
    };

    const service = new XpService(mockDb);
    const total = await service.awardXp('user_1', XP_REWARDS.LESSON_COMPLETED, 'Lesson completed');

    expect(mockDb.xpEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        amount: XP_REWARDS.LESSON_COMPLETED,
        reason: 'Lesson completed',
        refType: undefined,
        refId: undefined,
      },
    });
    expect(total).toBe(350);
  });

  it('increments streak on consecutive days of learning activity', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user_1',
          streakCount: 3,
          streakLastDate: yesterday,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      xpEvent: {
        create: vi.fn().mockResolvedValue({}),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
    };

    const service = new XpService(mockDb);
    const result = await service.recordActivity('user_1');

    expect(result.streakCount).toBe(4);
    expect(result.streakExtended).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalled();
  });
});
