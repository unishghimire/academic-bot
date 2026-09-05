import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { linkingService } from '../../services/linking.service.js';
import { progressService } from '../../services/progress.service.js';
import { prisma } from '../../db/client.js';
import { createSuccessEmbed, createInfoEmbed, createWarningEmbed } from '../../utils/embed-builder.js';
import { COLORS } from '../../config/constants.js';

export const linkCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Connect your Discord account to your verified Academy subscription'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const linkData = await linkingService.createLinkingCodeForDiscordUser(interaction.user.id);

      const embed = createInfoEmbed(
        '🔗 Account Verification & Linking',
        `To link your Academy account and activate your roles:\n\n` +
        `1. Click the secure link below to open the Academy portal:\n` +
        `👉 **[Click Here to Link Your Account](${linkData.linkingUrl})**\n\n` +
        `2. Or log into the website and enter your 6-digit linking code:\n` +
        `\`\`\`\n${linkData.code}\n\`\`\`\n` +
        `⏱️ *This code is valid for 15 minutes. Verification happens directly against the payment database.*`
      );

      await interaction.editReply({ embeds: [embed] });
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

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'No Academy account is linked to this Discord profile. Use `/link` to connect.')],
      });
      return;
    }

    const latestSub = user.subscriptions[0];
    const expiresDate = user.subscriptionExpiresAt
      ? `<t:${Math.floor(user.subscriptionExpiresAt.getTime() / 1000)}:F> (<t:${Math.floor(user.subscriptionExpiresAt.getTime() / 1000)}:R>)`
      : '*No expiration set*';

    const embed = createInfoEmbed(
      '💳 Subscription & Access Status',
      `**Student Email:** \`${user.email}\`\n` +
      `**Current Status:** \`${user.subscriptionStatus}\`\n` +
      `**Current Tier:** **Tier ${user.currentTier}**\n` +
      `**Plan:** \`${latestSub?.plan || 'Standard'}\`\n` +
      `**Expires/Renews:** ${expiresDate}\n\n` +
      `*Source of Truth: PostgreSQL Database. Synchronized via Stripe.*`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const progressCommand = {
  data: new SlashCommandBuilder()
    .setName('progress')
    .setDescription('View your detailed course completion, XP, and streak'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

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

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: { lessonProgress: true },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first.')],
      });
      return;
    }

    const completedLessonIds = new Set(user.lessonProgress.filter(p => p.completed).map(p => p.lessonId));

    // Find first incomplete lesson in user's accessible tiers
    const nextLesson = await prisma.lesson.findFirst({
      where: {
        tier: { lte: user.currentTier },
        id: { notIn: Array.from(completedLessonIds) },
      },
      orderBy: [{ tier: 'asc' }, { module: 'asc' }, { orderIndex: 'asc' }],
    });

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
      `**Requirements:** Video Watch (≥90%) ${nextLesson.requiresQuiz ? '+ Quiz ' : ''}${nextLesson.requiresAssignment ? '+ Assignment' : ''}\n\n` +
      `👉 **[Continue Lesson on Course Portal](${nextLesson.videoUrl || 'https://academy.example.com'})**`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
