import { SubscriptionStatus } from '@prisma/client';
import { prisma as defaultPrisma, isPostgresOnline } from '../db/client.js';
import { env } from '../config/env.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { localStore } from '../db/local-store.js';
import { getSupabaseClient } from '../db/supabase.js';
export class RoleSyncService {
    db;
    constructor(db = defaultPrisma) {
        this.db = db;
    }
    /**
     * Derives the set of managed Academy role IDs a user should possess based on DB state.
     * Strictly checks both subscriptionStatus AND subscriptionExpiresAt timestamp.
     */
    computeExpectedRoles(user) {
        const expectedRoleIds = new Set();
        const prohibitedRoleIds = new Set();
        const allManagedRoles = [
            env.ROLE_ELITE,
            env.ROLE_PREMIUM,
            env.ROLE_TIER_1,
            env.ROLE_TIER_2,
            env.ROLE_TIER_3,
            env.ROLE_GRADUATE,
        ].filter((r) => Boolean(r));
        // Verify user is marked ACTIVE AND expiration timestamp has not elapsed
        const isExpired = user.subscriptionExpiresAt
            ? new Date(user.subscriptionExpiresAt).getTime() <= Date.now()
            : false;
        const isActuallyActive = user.subscriptionStatus === SubscriptionStatus.ACTIVE && !isExpired;
        if (isActuallyActive) {
            // In the single-role model, all active subscribers receive the Elite role
            if (env.ROLE_ELITE)
                expectedRoleIds.add(env.ROLE_ELITE);
            if (env.ROLE_PREMIUM)
                expectedRoleIds.add(env.ROLE_PREMIUM);
            // Clean up any deprecated tier roles if present
            if (env.ROLE_TIER_1)
                prohibitedRoleIds.add(env.ROLE_TIER_1);
            if (env.ROLE_TIER_2)
                prohibitedRoleIds.add(env.ROLE_TIER_2);
            if (env.ROLE_TIER_3)
                prohibitedRoleIds.add(env.ROLE_TIER_3);
            if (env.ROLE_GRADUATE)
                prohibitedRoleIds.add(env.ROLE_GRADUATE);
        }
        else {
            // Inactive, expired, or cancelled: revoke Elite and all managed roles directly
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
    async syncUserRoles(userId, client) {
        let user = null;
        if (this.db === defaultPrisma && !isPostgresOnline()) {
            user = localStore.getUsers().find(u => u.id === userId || u.discordId === userId);
        }
        else {
            try {
                user = await this.db.user.findFirst({
                    where: { OR: [{ id: userId }, { discordId: userId }] },
                });
            }
            catch {
                user = localStore.getUsers().find(u => u.id === userId || u.discordId === userId);
            }
        }
        if (!user) {
            user = localStore.findUserByDiscordId(userId);
        }
        // Supabase fallback if user record is only present in payment_verifications
        if (!user) {
            const supabase = getSupabaseClient();
            if (supabase) {
                try {
                    const { data } = await supabase
                        .from('payment_verifications')
                        .select('*')
                        .or(`id.eq.${userId},discord_id.eq.${userId}`)
                        .limit(1);
                    if (data && data.length > 0) {
                        const rec = data[0];
                        const baseDate = rec.created_at ? new Date(rec.created_at) : new Date();
                        const duration = rec.access_duration_days || 30;
                        const expiresAt = rec.expires_at ? new Date(rec.expires_at) : new Date(baseDate.getTime() + duration * 86400000);
                        user = {
                            id: rec.id,
                            discordId: rec.discord_id,
                            subscriptionStatus: ['approved', 'verified'].includes(rec.status?.toLowerCase()) ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
                            subscriptionExpiresAt: expiresAt,
                            currentTier: rec.tier_number || 1,
                        };
                    }
                }
                catch { }
            }
        }
        if (!user || !user.discordId) {
            return null;
        }
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        if (!guild) {
            logger.warn({ guildId: env.DISCORD_GUILD_ID }, 'Guild not found during role sync');
            return null;
        }
        let member;
        try {
            member = await guild.members.fetch(user.discordId);
        }
        catch {
            // User is not present in Discord server
            return null;
        }
        const { expectedRoleIds, prohibitedRoleIds } = this.computeExpectedRoles(user);
        // Resolve configured role IDs against current guild cache, falling back to name
        const resolveRoleInGuild = (id) => {
            if (guild.roles.cache.has(id))
                return id;
            if (id === env.ROLE_ELITE || id === 'role_elite') {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'elite');
                if (r)
                    return r.id;
            }
            if (id === env.ROLE_PREMIUM) {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'elite' || x.name.toLowerCase() === 'premium');
                if (r)
                    return r.id;
            }
            if (id === env.ROLE_TIER_1) {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'tier-1');
                if (r)
                    return r.id;
            }
            if (id === env.ROLE_TIER_2) {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'tier-2');
                if (r)
                    return r.id;
            }
            if (id === env.ROLE_TIER_3) {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'tier-3');
                if (r)
                    return r.id;
            }
            if (id === env.ROLE_GRADUATE) {
                const r = guild.roles.cache.find(x => x.name.toLowerCase() === 'graduate');
                if (r)
                    return r.id;
            }
            return null;
        };
        const rolesToAdd = [];
        const rolesToRemove = [];
        // Check what needs to be added (only if role exists in guild and member does not already have it)
        for (const roleId of expectedRoleIds) {
            const resolved = resolveRoleInGuild(roleId);
            if (resolved && !member.roles.cache.has(resolved)) {
                rolesToAdd.push(resolved);
            }
        }
        // Check what needs to be removed (only if member currently has it)
        for (const roleId of prohibitedRoleIds) {
            const resolved = resolveRoleInGuild(roleId);
            if (resolved && member.roles.cache.has(resolved)) {
                rolesToRemove.push(resolved);
            }
        }
        const unchanged = rolesToAdd.length === 0 && rolesToRemove.length === 0;
        if (!unchanged) {
            if (rolesToAdd.length > 0) {
                await member.roles.add(rolesToAdd).catch(err => {
                    logger.warn({ err: err?.message, discordId: user.discordId }, 'Failed to add some Discord roles');
                });
            }
            if (rolesToRemove.length > 0) {
                await member.roles.remove(rolesToRemove).catch(err => {
                    logger.warn({ err: err?.message, discordId: user.discordId }, 'Failed to remove some Discord roles');
                });
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
            logger.info({
                userId: user.id,
                discordId: user.discordId,
                added: rolesToAdd,
                removed: rolesToRemove,
            }, 'Corrected Discord member roles from DB state');
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
    async syncAllLinkedUsers(client) {
        let userIds = [];
        if (this.db === defaultPrisma && !isPostgresOnline()) {
            userIds = localStore.getUsers().filter(u => u.discordId).map(u => u.id);
        }
        else {
            try {
                const linkedUsers = await this.db.user.findMany({
                    where: { discordId: { not: null } },
                    select: { id: true },
                });
                userIds = linkedUsers.map(u => u.id);
            }
            catch {
                userIds = localStore.getUsers().filter(u => u.discordId).map(u => u.id);
            }
        }
        let corrected = 0;
        for (const id of userIds) {
            try {
                const result = await this.syncUserRoles(id, client);
                if (result && !result.unchanged) {
                    corrected++;
                }
            }
            catch (error) {
                logger.error({ err: error, userId: id }, 'Error syncing user roles during sweep');
            }
        }
        logger.info({ total: userIds.length, corrected }, 'Completed full role sync sweep');
        return { total: userIds.length, corrected };
    }
}
export const roleSyncService = new RoleSyncService();
//# sourceMappingURL=role-sync.service.js.map