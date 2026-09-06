import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { linkingService } from '../../services/linking.service.js';
import { progressService } from '../../services/progress.service.js';
import { prisma, isPostgresOnline } from '../../db/client.js';
import { localStore } from '../../db/local-store.js';
import { getSupabaseClient } from '../../db/supabase.js';
import { createSuccessEmbed, createInfoEmbed, createWarningEmbed } from '../../utils/embed-builder.js';
import { env } from '../../config/env.js';
import { COLORS } from '../../config/constants.js';

export const linkCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Connect your Discord account to your verified Academy subscription'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const supabase = getSupabaseClient();
      const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';

      // 1. Check if user already has an approved payment verification in Supabase
      if (supabase) {
        try {
          const { data } = await supabase
            .from('payment_verifications')
            .select('*')
            .or(`discord_id.eq.${interaction.user.id},discord_username.ilike.%${interaction.user.username}%`)
            .in('status', ['verified', 'approved', 'Verified', 'Approved', 'VERIFIED', 'APPROVED'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0) {
            const rec = data[0];

            // Reconcile and assign Discord roles immediately
            if (interaction.guild) {
              const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
              if (member) {
                if (env.ROLE_PREMIUM) await member.roles.add(env.ROLE_PREMIUM).catch(() => {});
                const tier = rec.tier_number || 1;
                const tierRoleId = tier === 1 ? env.ROLE_TIER_1 : tier === 2 ? env.ROLE_TIER_2 : env.ROLE_TIER_3;
                if (tierRoleId) await member.roles.add(tierRoleId).catch(() => {});
              }
            }

            // Mark verified in Supabase if needed
            if (!rec.is_discord_verified || rec.discord_id !== interaction.user.id) {
              await supabase
                .from('payment_verifications')
                .update({ discord_id: interaction.user.id, discord_username: interaction.user.username, is_discord_verified: true })
                .eq('id', rec.id);
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel('💳 Open Student Portal')
                .setStyle(ButtonStyle.Link)
                .setURL(portalUrl)
            );

            const embed = createSuccessEmbed(
              '🎉 Account Verified & Connected!',
              `Welcome <@${interaction.user.id}>! Your Academy subscription has been verified in the payment database:\n\n` +
              `• **Tier:** **Tier ${rec.tier_number || 1}**\n` +
              `• **Status:** **Active Subscription**\n` +
              `• **Student:** \`${rec.student_name || interaction.user.username}\`\n\n` +
              `✅ Your **@Premium** and **@Tier-${rec.tier_number || 1}** roles are active! Use \`/subscription\` to view your plan or \`/meeting\` to see scheduled live classes.`
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
          }

          // 2. Check if there is a pending payment verification
          const { data: pendingData } = await supabase
            .from('payment_verifications')
            .select('*')
            .or(`discord_id.eq.${interaction.user.id},discord_username.ilike.%${interaction.user.username}%`)
            .in('status', ['pending', 'Pending', 'PENDING'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (pendingData && pendingData.length > 0) {
            const pending = pendingData[0];
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel('💳 Check Status on Portal')
                .setStyle(ButtonStyle.Link)
                .setURL(portalUrl)
            );

            const embed = createInfoEmbed(
              '⏳ Payment Verification Under Review',
              `We found your pending payment submission:\n\n` +
              `• **Transaction ID:** \`${pending.transaction_id || 'N/A'}\`\n` +
              `• **Submitted For:** Tier ${pending.tier_number || 1}\n` +
              `• **Status:** ⏳ **Under Admin Review**\n\n` +
              `Our staff verifies payments in the Admin Panel. As soon as approved, the bot will automatically grant your roles and send you a private welcome DM!`
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
          }
        } catch {
          // Fall through to link code generation
        }
      }

      // 3. Fallback: generate 6-digit linking code (offline / Supabase safe)
      const linkData = await linkingService.createLinkingCodeForDiscordUser(interaction.user.id);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('🔗 Open Portal to Link Account')
          .setStyle(ButtonStyle.Link)
          .setURL(portalUrl)
      );

      const embed = createInfoEmbed(
        '🔗 Account Verification & Linking',
        `To link your Academy account and activate your roles:\n\n` +
        `1. Click the button below to open the official Student Portal:\n` +
        `👉 **[Student Portal Link](${portalUrl})**\n\n` +
        `2. Your 6-digit linking verification code:\n` +
        `\`\`\`\n${linkData.code}\n\`\`\`\n` +
        `⏱️ *This code is valid for 15 minutes. Once approved, your Discord roles unlock automatically.*`
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Linking Error', error.message || 'Unable to generate linking code')],
      });
    }
  },
};

export const subscriptionCommand = {
  data: new SlashCommandBuilder()
    .setName('subscription')
    .setDescription('View your current Academy membership, plan, and renewal date'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    let user: any = null;

    // 1. Check PostgreSQL only if online
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({
          where: { discordId: interaction.user.id },
          include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
      } catch {
        // Fallback
      }
    }

    // 2. Check localStore
    if (!user) {
      user = localStore.findUserByDiscordId(interaction.user.id);
    }

    // 3. Check Supabase payment_verifications
    if (!user) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('payment_verifications')
            .select('*')
            .or(`discord_id.eq.${interaction.user.id},discord_username.ilike.%${interaction.user.username}%`)
            .in('status', ['verified', 'approved', 'Verified', 'Approved', 'VERIFIED', 'APPROVED'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (data && data.length > 0) {
            const rec = data[0];
            user = {
              email: rec.email || `${interaction.user.username}@discord.local`,
              subscriptionStatus: 'ACTIVE',
              currentTier: rec.tier_number || 1,
              subscriptionExpiresAt: new Date(new Date(rec.created_at).getTime() + (rec.access_duration_days || 30) * 24 * 60 * 60 * 1000),
              subscriptions: [{ plan: rec.plan_name || `Tier ${rec.tier_number || 1}` }],
            };
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'No active subscription was found for this Discord profile. Submit payment on the portal or use `/link`.')],
      });
      return;
    }

    const latestSub = user.subscriptions?.[0];
    const expiresDate = user.subscriptionExpiresAt
      ? `<t:${Math.floor(new Date(user.subscriptionExpiresAt).getTime() / 1000)}:F> (<t:${Math.floor(new Date(user.subscriptionExpiresAt).getTime() / 1000)}:R>)`
      : '*No expiration set*';

    const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('⚡ Manage Subscription / Renew')
        .setStyle(ButtonStyle.Link)
        .setURL(portalUrl)
    );

    const embed = createInfoEmbed(
      '💳 Subscription & Access Status',
      `**Student Email:** \`${user.email}\`\n` +
      `**Current Status:** \`${user.subscriptionStatus}\`\n` +
      `**Current Tier:** **Tier ${user.currentTier}**\n` +
      `**Plan:** \`${latestSub?.plan || 'Standard'}\`\n` +
      `**Expires/Renews:** ${expiresDate}\n\n` +
      `*Source of Truth: Supabase Cloud Database. Synchronized via Academy Admin Payments.*`
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  },
};

export const progressCommand = {
  data: new SlashCommandBuilder()
    .setName('progress')
    .setDescription('View your detailed course completion, XP, and streak'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    let user: any = null;
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({
          where: { discordId: interaction.user.id },
        });
      } catch {
        // Fallback
      }
    }
    if (!user) {
      user = localStore.findUserByDiscordId(interaction.user.id);
    }

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first to connect your Academy account.')],
      });
      return;
    }

    const summary = await progressService.getUserProgressSummary(user.id);

    const embed = createSuccessEmbed(
      '📊 Your Academy Progress',
      `**Overall Completion:** **${summary.overallPercentage}%** (${summary.totalCompleted}/${summary.totalLessons} lessons)\n` +
      `**Total XP:** **${summary.totalXp.toLocaleString()} XP**\n` +
      `**Learning Streak:** 🔥 **${summary.streakCount} day(s)**\n` +
      `**Active Tier:** **Tier ${summary.currentTier}**\n\n` +
      `**Tier Breakdown:**\n` +
      summary.tierStats
        .map(ts => `• **Tier ${ts.tier}:** ${ts.percentage}% completed (${ts.completedLessons}/${ts.totalLessons} lessons)`)
        .join('\n')
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const continueCommand = {
  data: new SlashCommandBuilder()
    .setName('continue')
    .setDescription('Resume exactly where you left off in your lessons'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    let user: any = null;
    if (isPostgresOnline()) {
      try {
        user = await prisma.user.findUnique({
          where: { discordId: interaction.user.id },
          include: { lessonProgress: true },
        });
      } catch {
        // Fallback
      }
    }
    if (!user) {
      user = localStore.findUserByDiscordId(interaction.user.id);
    }

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first.')],
      });
      return;
    }

    const completedLessonIds = new Set(
      ((user.lessonProgress as any[]) || []).filter((p: any) => p.completed).map((p: any) => p.lessonId)
    );

    let nextLesson: any = null;
    if (isPostgresOnline()) {
      try {
        nextLesson = await prisma.lesson.findFirst({
          where: {
            tier: { lte: user.currentTier },
            id: { notIn: Array.from(completedLessonIds) },
          },
          orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
        });
      } catch {
        // Fallback
      }
    }

    if (!nextLesson) {
      await interaction.editReply({
        embeds: [createSuccessEmbed('All Caught Up!', `You have completed all available lessons for your current tier (Tier ${user.currentTier})! Check your final project requirements or wait for the next tier unlock.`)],
      });
      return;
    }

    const embed = createInfoEmbed(
      `▶️ Next Up: ${nextLesson.title}`,
      `**Tier ${nextLesson.tier} • Module ${nextLesson.module} • Lesson ${nextLesson.orderIndex}**\n\n` +
      `${nextLesson.description}\n\n` +
      `**Requirements:** Lesson Study (Video/Docs) ${nextLesson.requiresAssignment ? '+ Practical Assignment' : ''}\n\n` +
      `👉 **Access Materials in Discord:**\n` +
      `• 🎬 Video upload: **#tier-${nextLesson.tier}-lessons**\n` +
      `• 📄 Lesson docs: **#tier-${nextLesson.tier}-resources**\n\n` +
      `Run \`/course lesson lesson_id:${nextLesson.id}\` to view full details and mark progress!`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
