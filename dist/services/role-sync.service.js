"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleSyncService = exports.RoleSyncService = void 0;
const client_1 = require("@prisma/client");
const client_js_1 = require("../db/client.js");
const env_js_1 = require("../config/env.js");
const audit_service_js_1 = require("./audit.service.js");
const logger_js_1 = require("../utils/logger.js");
const constants_js_1 = require("../config/constants.js");
const local_store_js_1 = require("../db/local-store.js");
class RoleSyncService {
    db;
    constructor(db = client_js_1.prisma) {
        this.db = db;
    }
    /**
     * Derives the set of managed Academy role IDs a user should possess based on DB state.
     */
    computeExpectedRoles(user) {
        const expectedRoleIds = new Set();
        const prohibitedRoleIds = new Set();
        const allManagedRoles = [
            env_js_1.env.ROLE_PREMIUM,
            env_js_1.env.ROLE_TIER_1,
            env_js_1.env.ROLE_TIER_2,
            env_js_1.env.ROLE_TIER_3,
            env_js_1.env.ROLE_GRADUATE,
        ].filter(Boolean);
        if (user.subscriptionStatus === client_1.SubscriptionStatus.ACTIVE) {
            expectedRoleIds.add(env_js_1.env.ROLE_PREMIUM);
            if (user.currentTier >= constants_js_1.TIER_LEVELS.TIER_1) {
                expectedRoleIds.add(env_js_1.env.ROLE_TIER_1);
            }
            if (user.currentTier >= constants_js_1.TIER_LEVELS.TIER_2) {
                expectedRoleIds.add(env_js_1.env.ROLE_TIER_2);
            }
            if (user.currentTier >= constants_js_1.TIER_LEVELS.TIER_3) {
                expectedRoleIds.add(env_js_1.env.ROLE_TIER_3);
            }
            if (user.currentTier >= constants_js_1.TIER_LEVELS.GRADUATE) {
                expectedRoleIds.add(env_js_1.env.ROLE_GRADUATE);
            }
            // Prohibit tiers higher than granted currentTier
            if (user.currentTier < constants_js_1.TIER_LEVELS.TIER_2) {
                prohibitedRoleIds.add(env_js_1.env.ROLE_TIER_2);
            }
            if (user.currentTier < constants_js_1.TIER_LEVELS.TIER_3) {
                prohibitedRoleIds.add(env_js_1.env.ROLE_TIER_3);
            }
            if (user.currentTier < constants_js_1.TIER_LEVELS.GRADUATE) {
                prohibitedRoleIds.add(env_js_1.env.ROLE_GRADUATE);
            }
        }
        else {
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
    async syncUserRoles(userId, client) {
        let user = null;
        if (this.db === client_js_1.prisma && !(0, client_js_1.isDatabaseOnline)()) {
            user = local_store_js_1.localStore.getUsers().find(u => u.id === userId);
        }
        else {
            try {
                user = await this.db.user.findUnique({ where: { id: userId } });
            }
            catch {
                user = local_store_js_1.localStore.getUsers().find(u => u.id === userId);
            }
        }
        if (!user || !user.discordId) {
            return null;
        }
        const guild = client.guilds.cache.get(env_js_1.env.DISCORD_GUILD_ID);
        if (!guild) {
            logger_js_1.logger.warn({ guildId: env_js_1.env.DISCORD_GUILD_ID }, 'Guild not found during role sync');
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
        const rolesToAdd = [];
        const rolesToRemove = [];
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
            await audit_service_js_1.auditService.log({
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
            logger_js_1.logger.info({
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
            }
            catch (error) {
                logger_js_1.logger.error({ err: error, userId: user.id }, 'Error syncing user roles during sweep');
            }
        }
        logger_js_1.logger.info({ total: linkedUsers.length, corrected }, 'Completed full role sync sweep');
        return { total: linkedUsers.length, corrected };
    }
}
exports.RoleSyncService = RoleSyncService;
exports.roleSyncService = new RoleSyncService();
//# sourceMappingURL=role-sync.service.js.map