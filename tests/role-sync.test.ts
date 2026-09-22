import { describe, it, expect } from 'vitest';
import { RoleSyncService } from '../src/services/role-sync.service.js';
import { SubscriptionStatus } from '@prisma/client';
import { env } from '../src/config/env.js';

describe('RoleSyncService — Single Elite Role & Legacy Role Stripping', () => {
  const service = new RoleSyncService({} as any);

  it('computes expected roles for active Elite student', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    // In the single-role model, all active subscribers get the Elite role
    expect(expectedRoleIds.has(env.ROLE_ELITE)).toBe(true);

    // Old tier roles are actively prohibited to keep servers clean
    expect(prohibitedRoleIds.has(env.ROLE_TIER_1)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_2)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_3)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_GRADUATE)).toBe(true);
  });

  it('prohibits all elite, premium and tier roles for expired or cancelled accounts', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.EXPIRED,
      currentTier: 1,
    });

    expect(expectedRoleIds.size).toBe(0);
    expect(prohibitedRoleIds.has(env.ROLE_ELITE)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_1)).toBe(true);
  });

  it('proves reconciliation idempotency for Elite subscribers', () => {
    // Member has exact expected roles: Elite
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    const memberRoleIds = new Set([env.ROLE_ELITE, env.ROLE_PREMIUM]);

    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    for (const roleId of expectedRoleIds) {
      if (!memberRoleIds.has(roleId)) rolesToAdd.push(roleId);
    }
    for (const roleId of prohibitedRoleIds) {
      if (memberRoleIds.has(roleId)) rolesToRemove.push(roleId);
    }

    // Both should be completely empty (unchanged)
    expect(rolesToAdd.length).toBe(0);
    expect(rolesToRemove.length).toBe(0);
  });

  it('detects and strips legacy tier roles from active Elite members', () => {
    const { prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    // Member has Elite AND legacy Tier-3 role
    const memberRoleIds = new Set([env.ROLE_ELITE, env.ROLE_TIER_3]);

    const rolesToRemove: string[] = [];
    for (const roleId of prohibitedRoleIds) {
      if (memberRoleIds.has(roleId)) rolesToRemove.push(roleId);
    }

    // Must detect ROLE_TIER_3 for immediate removal
    expect(rolesToRemove).toContain(env.ROLE_TIER_3);
  });
});
