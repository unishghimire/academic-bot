import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roleSyncService } from '../src/services/role-sync.service.js';
import { subscriptionService } from '../src/services/subscription.service.js';
import { manualPaymentService } from '../src/services/manual-payment.service.js';
import { runExpirySweep } from '../src/bot/jobs/expiry-check.job.js';
import { localStore } from '../src/db/local-store.js';
import { SubscriptionStatus } from '@prisma/client';
import { env } from '../src/config/env.js';

describe('Subscription Expiry, 3-Minute Sweep & Payment Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RoleSyncService — Payment Status & Expiry Verification', () => {
    it('grants roles when subscriptionStatus is ACTIVE and expiresAt is in the future', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const { expectedRoleIds, prohibitedRoleIds } = roleSyncService.computeExpectedRoles({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currentTier: 1,
        subscriptionExpiresAt: futureDate,
      });

      expect(expectedRoleIds.has(env.ROLE_ELITE)).toBe(true);
      expect(expectedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
      expect(prohibitedRoleIds.has(env.ROLE_ELITE)).toBe(false);
    });

    it('prohibits roles when subscriptionExpiresAt has passed, even if subscriptionStatus was ACTIVE', () => {
      const pastDate = new Date(Date.now() - 1000 * 60); // 1 minute ago
      const { expectedRoleIds, prohibitedRoleIds } = roleSyncService.computeExpectedRoles({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currentTier: 1,
        subscriptionExpiresAt: pastDate,
      });

      // No roles allowed; all managed roles must be stripped
      expect(expectedRoleIds.size).toBe(0);
      expect(prohibitedRoleIds.has(env.ROLE_ELITE)).toBe(true);
      expect(prohibitedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
    });
  });

  describe('localStore — Deduplication Tracking for Notices & Warnings', () => {
    const testUserId = `test_usr_${Date.now()}`;
    const testExpiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    it('accurately tracks and prevents duplicate 3-day warning notices', () => {
      expect(localStore.hasWarningBeenSent(testUserId, testExpiresAt)).toBe(false);

      localStore.markWarningSent(testUserId, testExpiresAt);

      expect(localStore.hasWarningBeenSent(testUserId, testExpiresAt)).toBe(true);
    });

    it('accurately tracks and prevents duplicate expiration notices', () => {
      expect(localStore.hasExpiredNoticeBeenSent(testUserId, testExpiresAt)).toBe(false);

      localStore.markExpiredNoticeSent(testUserId, testExpiresAt);

      expect(localStore.hasExpiredNoticeBeenSent(testUserId, testExpiresAt)).toBe(true);
    });
  });

  describe('runExpirySweep — Role Removal & DM Delivery', () => {
    it('sweeps expired users, strips roles, and sends expiration DM with payment portal link', async () => {
      const expiredDiscordId = `disc_swept_${Date.now()}`;
      const expiredUser = {
        id: `usr_swept_${Date.now()}_${Math.random()}`,
        discordId: expiredDiscordId,
        email: 'expired@student.local',
        expiresAt: new Date(Date.now() - 10000),
        tier: 1,
      };

      // Mock subscriptionService detailed sweep to return this expired user
      vi.spyOn(subscriptionService, 'sweepExpiredSubscriptionsDetailed').mockResolvedValue([expiredUser]);
      vi.spyOn(subscriptionService, 'findExpiringUsers').mockResolvedValue([]);

      const mockSend = vi.fn().mockResolvedValue({});
      const mockRolesRemove = vi.fn().mockResolvedValue({});
      const mockMember = {
        roles: {
          cache: new Map([[env.ROLE_PREMIUM, true], [env.ROLE_TIER_1, true]]),
          remove: mockRolesRemove,
        },
      };

      const mockClient: any = {
        isReady: () => true,
        guilds: {
          cache: new Map([
            [
              env.DISCORD_GUILD_ID,
              {
                members: {
                  fetch: vi.fn().mockResolvedValue(mockMember),
                },
              },
            ],
          ]),
        },
        users: {
          fetch: vi.fn().mockResolvedValue({
            id: expiredDiscordId,
            send: mockSend,
          }),
        },
      };

      await runExpirySweep(mockClient);

      // Verify roles were stripped
      expect(mockRolesRemove).toHaveBeenCalled();

      // Verify expiration DM was sent to the student
      expect(mockSend).toHaveBeenCalled();
      const sendArgs = mockSend.mock.calls[0][0];
      expect(sendArgs.embeds).toBeDefined();
      expect(sendArgs.components).toBeDefined();

      const embed = sendArgs.embeds[0].data;
      expect(embed.title).toContain('Course Subscription Expired');
      expect(embed.description).toContain('removed');

      // Check button contains student portal link
      const row = sendArgs.components[0];
      const button = row.components[0].data;
      expect(button.url).toBe(env.STUDENT_PORTAL_URL);
    });

    it('sends a 3-day warning DM when user subscription expires in <= 3 days without duplicate spam', async () => {
      const studentDiscordId = '999888777666555444';
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2 days left
      const expiringUser = {
        id: `usr_expiring_${Date.now()}`,
        discordId: studentDiscordId,
        email: 'warn@student.local',
        expiresAt,
        tier: 2,
        hoursRemaining: 48,
      };

      vi.spyOn(subscriptionService, 'sweepExpiredSubscriptionsDetailed').mockResolvedValue([]);
      vi.spyOn(subscriptionService, 'findExpiringUsers').mockResolvedValue([expiringUser]);

      const mockSend = vi.fn().mockResolvedValue({});
      const mockClient: any = {
        isReady: () => true,
        guilds: {
          cache: new Map([[env.DISCORD_GUILD_ID, { members: { fetch: vi.fn() } }]]),
        },
        users: {
          fetch: vi.fn().mockResolvedValue({
            id: studentDiscordId,
            send: mockSend,
          }),
        },
      };

      // First run: warning must be sent
      await runExpirySweep(mockClient);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const sendArgs = mockSend.mock.calls[0][0];
      expect(sendArgs.embeds[0].data.title).toContain('Expiring Soon');
      expect(sendArgs.components[0].components[0].data.url).toBe(env.STUDENT_PORTAL_URL);

      // Second run (simulating next 3-minute cron check): deduplication must prevent repeat DM!
      await runExpirySweep(mockClient);
      expect(mockSend).toHaveBeenCalledTimes(1); // still only 1, not spammed!
    });
  });

  describe('Welcome DM on Payment Approval', () => {
    it('dispatches welcome DM with student portal button upon manual payment approval', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      const mockClient: any = {
        users: {
          fetch: vi.fn().mockResolvedValue({
            send: mockSend,
          }),
        },
      };

      await manualPaymentService.sendWelcomeApprovalDM(
        mockClient,
        '123456789012345678',
        'Alex Student',
        49.99,
        'USD',
        'TX_TEST_123',
        30,
        1,
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.embeds[0].data.title).toContain('Payment Verified & Access Activated');
      expect(call.embeds[0].data.description).toContain('Alex Student');
      expect(call.components[0].components[0].data.url).toBe(env.STUDENT_PORTAL_URL);
    });
  });
});
