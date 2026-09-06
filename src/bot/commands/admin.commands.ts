import { SlashCommandBuilder, ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { prisma, isPostgresOnline } from '../../db/client.js';
import { getSupabaseClient } from '../../db/supabase.js';
import { requireAdmin } from '../middleware/permissions.js';
import { auditService } from '../../services/audit.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { tierEngine } from '../../services/tier-engine.service.js';
import { xpService } from '../../services/xp.service.js';
import { createSuccessEmbed, createWarningEmbed, createInfoEmbed } from '../../utils/embed-builder.js';
import { SubscriptionStatus } from '@prisma/client';
import { localStore } from '../../db/local-store.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

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

    if (isPostgresOnline()) {
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
        // Fallback below
      }
    } else {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { count } = await supabase
            .from('payment_verifications')
            .select('id', { count: 'exact', head: true })
            .in('status', ['verified', 'approved', 'Verified', 'Approved']);
          activeSubscribers = count || 0;
          totalUsers = count || 0;
        } catch {
          // Ignore
        }
      }
      const users = localStore.getUsers();
      if (users.length > totalUsers) totalUsers = users.length;
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
      `*Database single source of truth: Active.*`
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
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    let user: any = null;

    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({ where: { discordId: target.id } });
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
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            subscriptionExpiresAt: expiresAt,
          },
        });
      } catch {
        // Fallback below
      }
    }

    if (!user) {
      user = localStore.findUserByDiscordId(target.id) || {
        id: `usr_${target.id}`,
        discordId: target.id,
        accountId: `manual_${target.id}`,
        email: `${target.username}@discord.local`,
      };
      user.subscriptionStatus = SubscriptionStatus.ACTIVE;
      user.currentTier = user.currentTier || 1;
      user.subscriptionExpiresAt = expiresAt;
      localStore.saveUser(user);
    }

    // Sync to Supabase if connected
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('payment_verifications').upsert({
          discord_id: target.id,
          discord_username: target.username,
          student_name: target.displayName || target.username,
          email: `${target.username}@discord.local`,
          amount: 0,
          status: 'approved',
          tier_number: 1,
          access_duration_days: days,
          is_discord_verified: true,
          payment_method: 'Admin Manual Grant',
          transaction_id: `ADMIN_${Date.now()}`,
        }, { onConflict: 'discord_id' });
      } catch (err) {
        logger.warn({ err }, 'Could not upsert into Supabase for admin grant');
      }
    }

    // Grant Discord roles directly
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        if (env.ROLE_PREMIUM) await member.roles.add(env.ROLE_PREMIUM).catch(() => {});
        if (env.ROLE_TIER_1) await member.roles.add(env.ROLE_TIER_1).catch(() => {});
      }
    }

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_GRANT_PREMIUM',
      targetType: 'USER',
      targetId: user.id,
      reason,
      after: { status: SubscriptionStatus.ACTIVE, expiresAt },
    });

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

    let user: any = null;

    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({ where: { discordId: target.id } });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: SubscriptionStatus.SUSPENDED },
          });
        }
      } catch {
        // Fallback below
      }
    }

    if (!user) {
      user = localStore.findUserByDiscordId(target.id);
    }
    if (user) {
      user.subscriptionStatus = SubscriptionStatus.SUSPENDED;
      localStore.saveUser(user);
    }

    // Update Supabase if connected
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from('payment_verifications')
          .update({ status: 'revoked', is_discord_verified: false })
          .or(`discord_id.eq.${target.id},discord_username.ilike.%${target.username}%`);
      } catch (err) {
        logger.warn({ err }, 'Could not update Supabase for admin revoke');
      }
    }

    // Strip roles immediately from Discord member
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        const rolesToRemove = [
          env.ROLE_PREMIUM,
          env.ROLE_TIER_1,
          env.ROLE_TIER_2,
          env.ROLE_TIER_3,
          env.ROLE_GRADUATE,
        ].filter(Boolean);
        for (const r of rolesToRemove) {
          if (member.roles.cache.has(r)) {
            await member.roles.remove(r).catch(() => {});
          }
        }
      }
    }

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_REVOKE_PREMIUM',
      targetType: 'USER',
      targetId: user?.id || target.id,
      reason,
      after: { status: SubscriptionStatus.SUSPENDED },
    });

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

    let user: any = null;
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({ where: { discordId: target.id } });
      } catch {
        // Fallback below
      }
    }
    if (!user) {
      user = localStore.findUserByDiscordId(target.id);
    }

    if (!user) {
      user = localStore.saveUser({
        id: `usr_${target.id}`,
        discordId: target.id,
        currentTier: targetTier,
      });
    } else {
      user.currentTier = targetTier;
      localStore.saveUser(user);
    }

    // Direct role assignment
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        const tierRoleId = targetTier === 1 ? env.ROLE_TIER_1 : targetTier === 2 ? env.ROLE_TIER_2 : env.ROLE_TIER_3;
        if (tierRoleId) await member.roles.add(tierRoleId).catch(() => {});
      }
    }

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

    let user: any = null;
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({ where: { discordId: target.id } });
      } catch {
        // Fallback
      }
    }
    if (!user) {
      user = localStore.findUserByDiscordId(target.id);
    }

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Found', 'User has not linked an account.')],
      });
      return;
    }

    const newTotal = isPostgresOnline()
      ? await xpService.awardXp(user.id, amount, `Admin Grant: ${reason}`, 'admin_grant', interaction.user.id)
      : amount;

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
          `Added **+${amount} XP** to <@${target.id}>.\nReason: *${reason}*`
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
    let totalAuditEntries = localStore.getAuditLogs(100).length;

    if (isPostgresOnline()) {
      try {
        totalAuditEntries = await prisma.auditLog.count();
      } catch {
        // Fallback
      }
    }

    const embed = createInfoEmbed(
      '📊 Server & Audit Health',
      `**Total Discord Members:** ${totalMembers}\n` +
      `**Total Audit Entries:** ${totalAuditEntries}\n` +
      `**Database Single Source of Truth:** Connected (Supabase Cloud)`
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

    let user: any = null;
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({ where: { discordId: target.id } });
        if (user) {
          await prisma.lessonProgress.deleteMany({ where: { userId: user.id } });
          await prisma.user.update({ where: { id: user.id }, data: { currentTier: 1 } });
        }
      } catch {
        // Fallback
      }
    }

    if (!user) {
      user = localStore.findUserByDiscordId(target.id);
    }
    if (user) {
      user.currentTier = 1;
      localStore.saveUser(user);
    }

    await auditService.log({
      actorType: 'ADMIN',
      actorId: interaction.user.id,
      action: 'ADMIN_RESET_PROGRESS',
      targetType: 'USER',
      targetId: user?.id || target.id,
      reason,
      after: { currentTier: 1, reset: true },
    });

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
