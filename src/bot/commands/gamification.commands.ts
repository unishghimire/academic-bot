import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../db/client.js';
import { xpService } from '../../services/xp.service.js';
import { createInfoEmbed, createWarningEmbed } from '../../utils/embed-builder.js';

export const xpCommand = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('View your total XP balance and recent ledger events'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
      include: {
        xpEvents: {
          orderBy: { awardedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first.')],
      });
      return;
    }

    const totalXp = await xpService.getUserTotalXp(user.id);

    const history =
      user.xpEvents.length > 0
        ? user.xpEvents
            .map(e => `• **+${e.amount} XP**: ${e.reason} (<t:${Math.floor(e.awardedAt.getTime() / 1000)}:R>)`)
            .join('\n')
        : '*No XP earned yet. Complete your first lesson!*';

    const embed = createInfoEmbed(
      '✨ Your Academy XP Ledger',
      `**Total Balance:** **${totalXp.toLocaleString()} XP**\n` +
      `**Current Streak:** 🔥 **${user.streakCount} day(s)**\n\n` +
      `**Recent Activity:**\n${history}\n\n` +
      `*XP is stored in an append-only ledger and derived on the fly.*`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const rankCommand = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your current ranking and standing in the Academy'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first.')],
      });
      return;
    }

    const leaderboard = await xpService.getLeaderboard(100);
    const userRank = leaderboard.find(l => l.userId === user.id)?.rank || 'Unranked';
    const totalXp = await xpService.getUserTotalXp(user.id);

    const embed = createInfoEmbed(
      `🎖️ Academy Standing for ${interaction.user.username}`,
      `**Rank:** **#${userRank}**\n` +
      `**Tier:** **Tier ${user.currentTier}**\n` +
      `**Total XP:** **${totalXp.toLocaleString()} XP**\n` +
      `**Streak:** 🔥 **${user.streakCount} day(s)**`
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the Top 10 Academy creators'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const top = await xpService.getLeaderboard(10);

    if (top.length === 0) {
      await interaction.editReply({
        embeds: [createInfoEmbed('Academy Leaderboard', 'No student activity recorded yet. Be the first to earn XP!')],
      });
      return;
    }

    const lines = top.map(entry => {
      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `\`#${entry.rank}\``;
      const userTag = entry.discordId ? `<@${entry.discordId}>` : `Student \`${entry.userId.slice(0, 6)}\``;
      return `${medal} ${userTag} — **${entry.totalXp.toLocaleString()} XP** (Tier ${entry.currentTier} • 🔥 ${entry.streakCount}d)`;
    });

    const embed = createInfoEmbed(
      '🏆 Academy Hall of Fame — Top Creators',
      lines.join('\n\n') + '\n\n*Students can opt-out of leaderboard visibility in their profile settings.*'
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

export const challengeCommand = {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('View active creative challenges and earn bonus XP'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const challenges = await prisma.challenge.findMany({
      where: { active: true },
      orderBy: { deadline: 'asc' },
    });

    if (challenges.length === 0) {
      await interaction.editReply({
        embeds: [createInfoEmbed('Academy Challenges', 'No active challenge right now. Check back soon for the next prompt contest!')],
      });
      return;
    }

    const fields = challenges.map(c => ({
      name: `🎯 ${c.title} (+${c.xpReward} XP)`,
      value: `${c.description}\n**Deadline:** <t:${Math.floor(c.deadline.getTime() / 1000)}:R>`,
    }));

    const embed = createInfoEmbed(
      '🔥 Active Academy Challenges',
      'Submit your best AI video ad concepts to win bonus XP and exclusive creator badges!'
    ).addFields(fields);

    await interaction.editReply({ embeds: [embed] });
  },
};
