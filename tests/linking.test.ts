import { describe, it, expect, vi } from 'vitest';
import { LinkingService } from '../src/services/linking.service.js';

describe('LinkingService — Secure Account Verification', () => {
  it('generates a 6-character uppercase linking code valid for 15 minutes', async () => {
    const mockDb: any = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u_disc_1' }),
      },
      linkingCode: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(args => Promise.resolve(args.data)),
      },
    };

    const service = new LinkingService(mockDb);
    const result = await service.createLinkingCodeForDiscordUser('discord_123456');

    expect(result.code).toHaveLength(6);
    expect(result.code).toBe(result.code.toUpperCase());
    expect(result.linkingUrl).toContain(result.code);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects expired linking codes', async () => {
    const expiredDate = new Date(Date.now() - 60 * 1000);
    const mockDb: any = {
      linkingCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'code_1',
          code: 'EXP123',
          expiresAt: expiredDate,
          usedAt: null,
          user: { id: 'u_1', discordId: '123' },
        }),
      },
    };

    const service = new LinkingService(mockDb);
    await expect(
      service.verifyAndLinkCode('EXP123', 'acc_verified', 'student@test.com')
    ).rejects.toThrow('This linking code has expired');
  });

  it('rejects already used linking codes', async () => {
    const mockDb: any = {
      linkingCode: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'code_2',
          code: 'USED45',
          expiresAt: new Date(Date.now() + 60000),
          usedAt: new Date(),
          user: { id: 'u_1', discordId: '123' },
        }),
      },
    };

    const service = new LinkingService(mockDb);
    await expect(
      service.verifyAndLinkCode('USED45', 'acc_verified', 'student@test.com')
    ).rejects.toThrow('This linking code has already been used');
  });
});
