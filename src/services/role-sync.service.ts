import { Client, Guild, GuildMember } from 'discord.js';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { env } from '../config/env.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { TIER_LEVELS } from '../config/constants.js';

export interface SyncResult {
  userId: string;
  discordId: string;
  rolesAdded: string[];
  rolesRemoved: string[];
  unchanged: boolean;
}

export class RoleSyncService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  /**
   * Derives the set of managed Academy role IDs a user should possess based on DB state.
   */
  computeExpectedRoles(user: { subscriptionStatus: SubscriptionStatus; currentTier: number }): {
    expectedRoleIds: Set<string>;
    prohibitedRoleIds: Set<string>;
  } {
    const expectedRoleIds = new Set<string>();
    const prohibitedRoleIds = new Set<string>();

    const allManagedRoles = [
      env.ROLE_PREMIUM,
      env.ROLE_TIER_1,
      env.ROLE_TIER_2,
      env.ROLE_TIER_3,
      env.ROLE_GRADUATE,
    ].filter(Boolean);

    if (user.subscriptionStatus === SubscriptionStatus.ACTIVE) {
      expectedRoleIds.add(env.ROLE_PREMIUM);

      if (user.currentTier >= TIER_LEVELS.TIER_1) {
        expectedRoleIds.add(env.ROLE_TIER_1);
      }
      if (user.currentTier >= TIER_LEVELS.TIER_2) {
        expectedRoleIds.add(env.ROLE_TIER_2);
      }
      if (user.currentTier >= TIER_LEVELS.TIER_3) {
        expectedRoleIds.add(env.ROLE_TIER_3);
      }
      if (user.currentTier >= TIER_LEVELS.GRADUATE) {
        expectedRoleIds.add(env.ROLE_GRADUATE);
      }

      // Prohibit tiers higher than granted currentTier
      if (user.currentTier < TIER_LEVELS.TIER_2) {
        prohibitedRoleIds.add(env.ROLE_TIER_2);
      }
      if (user.currentTier < TIER_LEVELS.TIER_3) {
        prohibitedRoleIds.add(env.ROLE_TIER_3);
      }
      if (user.currentTier < TIER_LEVELS.GRADUATE) {
        prohibitedRoleIds.add(env.ROLE_GRADUATE);
      }
    } else {
      // Inactive, expired, or cancelled: revoke all academy progression & premium roles
      for (const roleId of allManagedRoles) {
        prohibitedRoleIds.add(roleId);
      }
    }

    return { expectedRoleIds, prohibitedRoleIds };
  }

  /**
   * Synchronizes a single member's Discord roles with the database state.
   * Completely idempotent: running twice in a row causes 0 role mutations on the second run.
   */
  async syncUserRoles(userId: string, client: Client): Promise<SyncResult | null> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.discordId) {
      return null;
    }

    const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
    if (!guild) {
      logger.warn({ guildId: env.DISCORD_GUILD_ID }, 'Guild not found during role sync');
      return null;
    }

    let member: GuildMember;
    try {
      member = await guild.members.fetch(user.discordId);
    } catch {
      // User is not present in Discord server
      return null;
    }

    const { expectedRoleIds, prohibitedRoleIds } = this.computeExpectedRoles(user);

    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    // Check what needs to be added
    for (const roleId of expectedRoleIds) {
      if (!member.roles.cache.has(roleId)) {
        rolesToAdd.push(roleId);
      }
    }

    // Check what needs to be removed
    for (const roleId of prohibitedRoleIds) {
      if (member.roles.cache.has(roleId)) {
        rolesToRemove.push(roleId);
      }
    }

    const unchanged = rolesToAdd.length === 0 && rolesToRemove.length === 0;

    if (!unchanged) {
      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd);
      }
      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
      }

      // Record correction to append-only audit log
      await auditService.log({
        actorType: 'SYSTEM',
        actorId: 'ROLE_SYNC_JOB',
        action: 'ROLE_RECONCILIATION_CORRECTION',
        targetType: 'USER',
        targetId: user.id,
        reason: `Reconciled Discord role cache with DB state. Status: ${user.subscriptionStatus}, Tier: ${user.currentTier}`,
        before: { currentRoles: Array.from(member.roles.cache.keys()) },
        after: {
          added: rolesToAdd,
          removed: rolesToRemove,
        },
      });

      logger.info(
        {
          userId: user.id,
          discordId: user.discordId,
          added: rolesToAdd,
          removed: rolesToRemove,
        },
        'Corrected Discord member roles from DB state'
      );
    }

    return {
      userId: user.id,
      discordId: user.discordId,
      rolesAdded: rolesToAdd,
      rolesRemoved: rolesToRemove,
      unchanged,
    };
  }

  /**
   * Full sweep across all linked users in the database
   */
  async syncAllLinkedUsers(client: Client): Promise<{ total: number; corrected: number }> {
    const linkedUsers = await this.db.user.findMany({
      where: { discordId: { not: null } },
      select: { id: true },
    });

    let corrected = 0;
    for (const user of linkedUsers) {
      try {
        const result = await this.syncUserRoles(user.id, client);
        if (result && !result.unchanged) {
          corrected++;
        }
      } catch (error) {
        logger.error({ err: error, userId: user.id }, 'Error syncing user roles during sweep');
      }
    }

    logger.info({ total: linkedUsers.length, corrected }, 'Completed full role sync sweep');
    return { total: linkedUsers.length, corrected };
  }
}

export const roleSyncService = new RoleSyncService();
