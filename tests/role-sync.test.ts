import { describe, it, expect } from 'vitest';
import { RoleSyncService } from '../src/services/role-sync.service.js';
import { SubscriptionStatus } from '@prisma/client';
import { env } from '../src/config/env.js';

describe('RoleSyncService — Idempotency & Rogue Role Stripping', () => {
  const service = new RoleSyncService({} as any);

  it('computes expected roles for active Tier 1 student', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    expect(expectedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
    expect(expectedRoleIds.has(env.ROLE_TIER_1)).toBe(true);
    expect(expectedRoleIds.has(env.ROLE_TIER_2)).toBe(false);

    // Higher tiers must be explicitly prohibited to strip rogue assignments
    expect(prohibitedRoleIds.has(env.ROLE_TIER_2)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_3)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_GRADUATE)).toBe(true);
  });

  it('computes expected roles for active Tier 2 student', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 2,
    });

    expect(expectedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
    expect(expectedRoleIds.has(env.ROLE_TIER_1)).toBe(true);
    expect(expectedRoleIds.has(env.ROLE_TIER_2)).toBe(true);
    expect(expectedRoleIds.has(env.ROLE_TIER_3)).toBe(false);

    expect(prohibitedRoleIds.has(env.ROLE_TIER_3)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_GRADUATE)).toBe(true);
  });

  it('prohibits all premium and tier roles for expired or cancelled accounts', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.EXPIRED,
      currentTier: 2,
    });

    expect(expectedRoleIds.size).toBe(0);
    expect(prohibitedRoleIds.has(env.ROLE_PREMIUM)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_1)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_2)).toBe(true);
    expect(prohibitedRoleIds.has(env.ROLE_TIER_3)).toBe(true);
  });

  it('proves reconciliation idempotency', () => {
    // Member has exact expected roles: Premium + Tier 1
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    const memberRoleIds = new Set([env.ROLE_PREMIUM, env.ROLE_TIER_1]);

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

  it('detects and strips rogue manually-added Tier-3 role on Tier-1 student', () => {
    const { expectedRoleIds, prohibitedRoleIds } = service.computeExpectedRoles({
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentTier: 1,
    });

    // Rogue state: member has Premium, Tier 1, AND a manually added Tier 3 role!
    const memberRoleIds = new Set([env.ROLE_PREMIUM, env.ROLE_TIER_1, env.ROLE_TIER_3]);

    const rolesToRemove: string[] = [];
    for (const roleId of prohibitedRoleIds) {
      if (memberRoleIds.has(roleId)) rolesToRemove.push(roleId);
    }

    // Must detect ROLE_TIER_3 for immediate removal
    expect(rolesToRemove).toContain(env.ROLE_TIER_3);
  });
});
