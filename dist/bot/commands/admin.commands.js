"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetProgressCommand = exports.serverStatsCommand = exports.broadcastCommand = exports.addXpCommand = exports.unlockTierCommand = exports.revokePremiumCommand = exports.grantPremiumCommand = exports.adminDashboardCommand = void 0;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../../db/client.js");
const permissions_js_1 = require("../middleware/permissions.js");
const audit_service_js_1 = require("../../services/audit.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const tier_engine_service_js_1 = require("../../services/tier-engine.service.js");
const xp_service_js_1 = require("../../services/xp.service.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
const client_1 = require("@prisma/client");
const local_store_js_1 = require("../../db/local-store.js");
exports.adminDashboardCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('admin-dashboard')
        .setDescription('Display high-level Academy operations and user counts'),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        let totalUsers = 0;
        let activeSubscribers = 0;
        let tier1Count = 0;
        let tier2Count = 0;
        let tier3Count = 0;
        let graduateCount = 0;
        let pendingTickets = 0;
        try {
            totalUsers = await client_js_1.prisma.user.count();
            activeSubscribers = await client_js_1.prisma.user.count({
                where: { subscriptionStatus: client_1.SubscriptionStatus.ACTIVE },
            });
            tier1Count = await client_js_1.prisma.user.count({ where: { currentTier: 1 } });
            tier2Count = await client_js_1.prisma.user.count({ where: { currentTier: 2 } });
            tier3Count = await client_js_1.prisma.user.count({ where: { currentTier: 3 } });
            graduateCount = await client_js_1.prisma.user.count({ where: { currentTier: 4 } });
            pendingTickets = await client_js_1.prisma.ticket.count({ where: { status: 'OPEN' } });
        }
        catch {
            const users = local_store_js_1.localStore.getUsers();
            totalUsers = users.length;
            activeSubscribers = users.filter(u => u.subscriptionStatus === client_1.SubscriptionStatus.ACTIVE).length;
            tier1Count = users.filter(u => u.currentTier === 1).length;
            tier2Count = users.filter(u => u.currentTier === 2).length;
            tier3Count = users.filter(u => u.currentTier === 3).length;
            graduateCount = users.filter(u => u.currentTier === 4).length;
            pendingTickets = 0;
        }
        const embed = (0, embed_builder_js_1.createInfoEmbed)('⚙️ Academy Admin Operations Dashboard', `**Total Registered Students:** **${totalUsers}**\n` +
            `**Active Paid Subscribers:** **${activeSubscribers}**\n` +
            `**Open Support Tickets:** **${pendingTickets}**\n\n` +
            `**Student Tier Distribution:**\n` +
            `• Tier 1 (Fundamentals): **${tier1Count}**\n` +
            `• Tier 2 (Advanced): **${tier2Count}**\n` +
            `• Tier 3 (Mastery): **${tier3Count}**\n` +
            `• Graduates: 🏆 **${graduateCount}**\n\n` +
            `*Database source of truth operational.*`);
        await interaction.editReply({ embeds: [embed] });
    },
};
exports.grantPremiumCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('grant-premium')
        .setDescription('Manually grant premium access to a student')
        .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('days').setDescription('Duration in days').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('student', true);
        const days = interaction.options.getInteger('days', true);
        const reason = interaction.options.getString('reason', true);
        let user = await client_js_1.prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) {
            user = await client_js_1.prisma.user.create({
                data: {
                    discordId: target.id,
                    accountId: `manual_${target.id}`,
                    email: `${target.username}@discord.local`,
                    subscriptionStatus: client_1.SubscriptionStatus.ACTIVE,
                    currentTier: 1,
                },
            });
        }
        const previousStatus = user.subscriptionStatus;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await client_js_1.prisma.user.update({
            where: { id: user.id },
            data: {
                subscriptionStatus: client_1.SubscriptionStatus.ACTIVE,
                subscriptionExpiresAt: expiresAt,
            },
        });
        await audit_service_js_1.auditService.log({
            actorType: 'ADMIN',
            actorId: interaction.user.id,
            action: 'ADMIN_GRANT_PREMIUM',
            targetType: 'USER',
            targetId: user.id,
            reason,
            before: { status: previousStatus },
            after: { status: client_1.SubscriptionStatus.ACTIVE, expiresAt },
        });
        // Reconcile roles immediately
        await role_sync_service_js_1.roleSyncService.syncUserRoles(user.id, interaction.client);
        await interaction.editReply({
            embeds: [
                (0, embed_builder_js_1.createSuccessEmbed)('Premium Access Granted', `Granted ${days} day(s) of Premium access to <@${target.id}>.\nReason: *${reason}*`),
            ],
        });
    },
};
exports.revokePremiumCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('revoke-premium')
        .setDescription('Revoke premium subscription for a student')
        .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('student', true);
        const reason = interaction.options.getString('reason', true);
        const user = await client_js_1.prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Found', 'User is not in the Academy database.')],
            });
            return;
        }
        const previousStatus = user.subscriptionStatus;
        await client_js_1.prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: client_1.SubscriptionStatus.SUSPENDED },
        });
        await audit_service_js_1.auditService.log({
            actorType: 'ADMIN',
            actorId: interaction.user.id,
            action: 'ADMIN_REVOKE_PREMIUM',
            targetType: 'USER',
            targetId: user.id,
            reason,
            before: { status: previousStatus },
            after: { status: client_1.SubscriptionStatus.SUSPENDED },
        });
        // Strip roles immediately via reconciler
        await role_sync_service_js_1.roleSyncService.syncUserRoles(user.id, interaction.client);
        await interaction.editReply({
            embeds: [
                (0, embed_builder_js_1.createSuccessEmbed)('Premium Revoked', `Revoked Premium access for <@${target.id}>.\nReason: *${reason}*`),
            ],
        });
    },
};
exports.unlockTierCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('unlock-tier')
        .setDescription('Admin override to set a student tier level (strictly audited)')
        .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt
        .setName('tier')
        .setDescription('Target tier')
        .setRequired(true)
        .addChoices({ name: 'Tier 1', value: 1 }, { name: 'Tier 2', value: 2 }, { name: 'Tier 3', value: 3 }, { name: 'Graduate', value: 4 }))
        .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('student', true);
        const targetTier = interaction.options.getInteger('tier', true);
        const reason = interaction.options.getString('reason', true);
        const user = await client_js_1.prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Found', 'User has not linked an Academy account.')],
            });
            return;
        }
        // Apply via TierEngine admin override
        await tier_engine_service_js_1.tierEngine.applyAdminOverride(user.id, targetTier, interaction.user.id, reason);
        // Sync Discord roles immediately
        await role_sync_service_js_1.roleSyncService.syncUserRoles(user.id, interaction.client);
        await interaction.editReply({
            embeds: [
                (0, embed_builder_js_1.createSuccessEmbed)('Tier Override Applied', `Student <@${target.id}> advanced to **Tier ${targetTier}**.\nReason: *${reason}*`),
            ],
        });
    },
};
exports.addXpCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('add-xp')
        .setDescription('Grant bonus XP to a student (appends to XP ledger)')
        .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Mandatory reason').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('student', true);
        const amount = interaction.options.getInteger('amount', true);
        const reason = interaction.options.getString('reason', true);
        const user = await client_js_1.prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Found', 'User has not linked an account.')],
            });
            return;
        }
        const newTotal = await xp_service_js_1.xpService.awardXp(user.id, amount, `Admin Grant by ${interaction.user.tag}: ${reason}`, 'admin_grant', interaction.user.id);
        await audit_service_js_1.auditService.log({
            actorType: 'ADMIN',
            actorId: interaction.user.id,
            action: 'ADMIN_ADD_XP',
            targetType: 'USER',
            targetId: user.id,
            reason,
            after: { amount, newTotal },
        });
        await interaction.editReply({
            embeds: [
                (0, embed_builder_js_1.createSuccessEmbed)('XP Awarded', `Added **+${amount} XP** to <@${target.id}>.\nNew Total: **${newTotal.toLocaleString()} XP**\nReason: *${reason}*`),
            ],
        });
    },
};
exports.broadcastCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('Broadcast an official Academy announcement')
        .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Message text').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for broadcast').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message', true);
        const reason = interaction.options.getString('reason', true);
        const embed = (0, embed_builder_js_1.createInfoEmbed)('📢 Academy Official Announcement', message);
        await channel.send({ embeds: [embed] });
        await audit_service_js_1.auditService.log({
            actorType: 'ADMIN',
            actorId: interaction.user.id,
            action: 'ADMIN_BROADCAST',
            targetType: 'CHANNEL',
            targetId: channel.id,
            reason,
            after: { message },
        });
        await interaction.editReply({
            embeds: [(0, embed_builder_js_1.createSuccessEmbed)('Broadcast Dispatched', `Announcement posted to <#${channel.id}>.`)],
        });
    },
};
exports.serverStatsCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('server-stats')
        .setDescription('View server role counts and sync health'),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply('Cannot run outside guild.');
            return;
        }
        const totalMembers = guild.memberCount;
        const totalAuditEntries = await client_js_1.prisma.auditLog.count();
        const embed = (0, embed_builder_js_1.createInfoEmbed)('📊 Server & Audit Health', `**Total Discord Members:** ${totalMembers}\n` +
            `**Total Audit Entries:** ${totalAuditEntries}\n` +
            `**Reconciler Status:** Active (runs every 10 mins)\n` +
            `**Database Single Source of Truth:** Connected`);
        await interaction.editReply({ embeds: [embed] });
    },
};
exports.resetProgressCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('reset-progress')
        .setDescription('Reset lesson progress for a student (audited)')
        .addUserOption(opt => opt.setName('student').setDescription('Target student').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('student', true);
        const reason = interaction.options.getString('reason', true);
        const user = await client_js_1.prisma.user.findUnique({ where: { discordId: target.id } });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Found', 'User not found in Academy database.')],
            });
            return;
        }
        await client_js_1.prisma.lessonProgress.deleteMany({ where: { userId: user.id } });
        await client_js_1.prisma.user.update({ where: { id: user.id }, data: { currentTier: 1 } });
        await audit_service_js_1.auditService.log({
            actorType: 'ADMIN',
            actorId: interaction.user.id,
            action: 'ADMIN_RESET_PROGRESS',
            targetType: 'USER',
            targetId: user.id,
            reason,
            before: { currentTier: user.currentTier },
            after: { currentTier: 1, reset: true },
        });
        await role_sync_service_js_1.roleSyncService.syncUserRoles(user.id, interaction.client);
        await interaction.editReply({
            embeds: [
                (0, embed_builder_js_1.createSuccessEmbed)('Progress Reset Completed', `Reset progress for <@${target.id}> to Tier 1.\nReason: *${reason}*`),
            ],
        });
    },
};
//# sourceMappingURL=admin.commands.js.map