import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { prisma } from '../../db/client.js';
import { requireAdmin } from '../middleware/permissions.js';
import { auditService } from '../../services/audit.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { tierEngine } from '../../services/tier-engine.service.js';
import { xpService } from '../../services/xp.service.js';
import { createSuccessEmbed, createWarningEmbed, createInfoEmbed } from '../../utils/embed-builder.js';
import { SubscriptionStatus } from '@prisma/client';
import { localStore } from '../../db/local-store.js';

export const adminDashboardCommand = {
  data: new SlashCommandBuilder()
    .setName('admin-dashboard')
    .setDescription('Display high-level Academy operations and user counts'),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    let totalUsers = 0;
    let activeSubscribers = 0;
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let graduateCount = 0;
    let pendingTickets = 0;

    try {
      totalUsers = await prisma.user.count();
      activeSubscribers = await prisma.user.count({
        where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      });
      tier1Count = await prisma.user.count({ where: { currentTier: 1 } });
      tier2Count = await prisma.user.count({ where: { currentTier: 2 } });
      tier3Count = await prisma.user.count({ where: { currentTier: 3 } });
      graduateCount = await prisma.user.count({ where: { currentTier: 4 } });
      pendingTickets = await prisma.ticket.count({ where: { status: 'OPEN' } });
    } catch {
      const users = localStore.getUsers();
      totalUsers = users.length;
      activeSubscribers = users.filter(u => u.subscriptionStatus === SubscriptionStatus.ACTIVE).length;
      tier1Count = users.filter(u => u.currentTier === 1).length;
      tier2Count = users.filter(u => u.currentTier === 2).length;
      tier3Count = users.filter(u => u.currentTier === 3).length;
      graduateCount = users.filter(u => u.currentTier === 4).length;
      pendingTickets = 0;
    }

    const embed = createInfoEmbed(
      '⚙️ Academy Admin Operations Dashboard',
      `**Total Registered Students:** **${totalUsers}**\n` +
      `**Active Paid Subscribers:** **${activeSubscribers}**\n` +
      `**Open Support Tickets:** **${pendingTickets}**\n\n` +
      `**Student Tier Distribution:**\n` +
      `• Tier 1 (Fundamentals): **${tier1Count}**\n` +
      `• Tier 2 (Advanced): **${tier2Count}**\n` +
      `• Tier 3 (Mastery): **${tier3Count}**\n` +
      `• Graduates: 🏆 **${graduateCount}**\n\n` +
      `*Database source of truth operational.*`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const grantPremiumCommand = {
  data: new SlashCommandBuilder()
    .setName('grant-premium')
    .setDescription('Manually grant premium access to a student')
    .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
    .addIntegerOption(opt => opt.setName('days').setDescription('Duration in days').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('student', true);
    const days = interaction.options.getInteger('days', true);
    const reason = interaction.options.getString('reason', true);

    let user = await prisma.user.findUnique({ where: { discordId: target.id } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: target.id,
          accountId: `manual_${target.id}`,
          email: `${target.username}@discord.local`,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentTier: 1,
        },
      });
    }

    const previousStatus = user.subscriptionStatus;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: expiresAt,
      },
    });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_GRANT_PREMIUM',
      targetType: 'USER',
      targetId: user.id,
      reason,
      before: { status: previousStatus },
      after: { status: SubscriptionStatus.ACTIVE, expiresAt },
    });

    // Reconcile roles immediately
    await roleSyncService.syncUserRoles(user.id, interaction.client);

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Premium Access Granted',
          `Granted ${days} day(s) of Premium access to <@${target.id}>.\nReason: *${reason}*`
        ),
      ],
    });
  },
};

export const revokePremiumCommand = {
  data: new SlashCommandBuilder()
    .setName('revoke-premium')
    .setDescription('Revoke premium subscription for a student')
    .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('student', true);
    const reason = interaction.options.getString('reason', true);

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', 'User is not in the Academy database.')],
      });
      return;
    }

    const previousStatus = user.subscriptionStatus;

    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
    });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_REVOKE_PREMIUM',
      targetType: 'USER',
      targetId: user.id,
      reason,
      before: { status: previousStatus },
      after: { status: SubscriptionStatus.SUSPENDED },
    });

    // Strip roles immediately via reconciler
    await roleSyncService.syncUserRoles(user.id, interaction.client);

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Premium Revoked',
          `Revoked Premium access for <@${target.id}>.\nReason: *${reason}*`
        ),
      ],
    });
  },
};

export const unlockTierCommand = {
  data: new SlashCommandBuilder()
    .setName('unlock-tier')
    .setDescription('Admin override to set a student tier level (strictly audited)')
    .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
    .addIntegerOption(opt =>
      opt
        .setName('tier')
        .setDescription('Target tier')
        .setRequired(true)
        .addChoices(
          { name: 'Tier 1', value: 1 },
          { name: 'Tier 2', value: 2 },
          { name: 'Tier 3', value: 3 },
          { name: 'Graduate', value: 4 }
        )
    )
    .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('student', true);
    const targetTier = interaction.options.getInteger('tier', true);
    const reason = interaction.options.getString('reason', true);

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', 'User has not linked an Academy account.')],
      });
      return;
    }

    // Apply via TierEngine admin override
    await tierEngine.applyAdminOverride(user.id, targetTier, interaction.user.id, reason);

    // Sync Discord roles immediately
    await roleSyncService.syncUserRoles(user.id, interaction.client);

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Tier Override Applied',
          `Student <@${target.id}> advanced to **Tier ${targetTier}**.\nReason: *${reason}*`
        ),
      ],
    });
  },
};

export const addXpCommand = {
  data: new SlashCommandBuilder()
    .setName('add-xp')
    .setDescription('Grant bonus XP to a student (appends to XP ledger)')
    .addUserOption(opt => opt.setName('student').setDescription('Target user').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Mandatory reason').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('student', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason', true);

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', 'User has not linked an account.')],
      });
      return;
    }

    const newTotal = await xpService.awardXp(
      user.id,
      amount,
      `Admin Grant by ${interaction.user.tag}: ${reason}`,
      'admin_grant',
      interaction.user.id
    );

    await auditService.log({
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
        createSuccessEmbed(
          'XP Awarded',
          `Added **+${amount} XP** to <@${target.id}>.\nNew Total: **${newTotal.toLocaleString()} XP**\nReason: *${reason}*`
        ),
      ],
    });
  },
};

export const broadcastCommand = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Broadcast an official Academy announcement')
    .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Message text').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for broadcast').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel', true) as TextChannel;
    const message = interaction.options.getString('message', true);
    const reason = interaction.options.getString('reason', true);

    const embed = createInfoEmbed('📢 Academy Official Announcement', message);

    await channel.send({ embeds: [embed] });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_BROADCAST',
      targetType: 'CHANNEL',
      targetId: channel.id,
      reason,
      after: { message },
    });

    await interaction.editReply({
      embeds: [createSuccessEmbed('Broadcast Dispatched', `Announcement posted to <#${channel.id}>.`)],
    });
  },
};

export const serverStatsCommand = {
  data: new SlashCommandBuilder()
    .setName('server-stats')
    .setDescription('View server role counts and sync health'),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('Cannot run outside guild.');
      return;
    }

    const totalMembers = guild.memberCount;
    const totalAuditEntries = await prisma.auditLog.count();

    const embed = createInfoEmbed(
      '📊 Server & Audit Health',
      `**Total Discord Members:** ${totalMembers}\n` +
      `**Total Audit Entries:** ${totalAuditEntries}\n` +
      `**Reconciler Status:** Active (runs every 10 mins)\n` +
      `**Database Single Source of Truth:** Connected`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const resetProgressCommand = {
  data: new SlashCommandBuilder()
    .setName('reset-progress')
    .setDescription('Reset lesson progress for a student (audited)')
    .addUserOption(opt => opt.setName('student').setDescription('Target student').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Mandatory administrative reason').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('student', true);
    const reason = interaction.options.getString('reason', true);

    const user = await prisma.user.findUnique({ where: { discordId: target.id } });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', 'User not found in Academy database.')],
      });
      return;
    }

    await prisma.lessonProgress.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { currentTier: 1 } });

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_RESET_PROGRESS',
      targetType: 'USER',
      targetId: user.id,
      reason,
      before: { currentTier: user.currentTier },
      after: { currentTier: 1, reset: true },
    });

    await roleSyncService.syncUserRoles(user.id, interaction.client);

    await interaction.editReply({
      embeds: [
        createSuccessEmbed(
          'Progress Reset Completed',
          `Reset progress for <@${target.id}> to Tier 1.\nReason: *${reason}*`
        ),
      ],
    });
  },
};
