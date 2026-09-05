import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../db/client.js';
import { aiService, AiTaskType } from '../../services/ai.service.js';
import { requirePremium } from '../middleware/permissions.js';
import { createSuccessEmbed, createWarningEmbed, createErrorEmbed } from '../../utils/embed-builder.js';

export const aiCommand = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Academy AI Assistant Suite for video ads generation and creative strategy')
    .addSubcommand(sub =>
      sub
        .setName('hook')
        .setDescription('Generate 5 viral, high-converting video hooks for TikTok / Reels')
        .addStringOption(opt => opt.setName('prompt').setDescription('What is your ad or product about?').setRequired(true))
        .addStringOption(opt => opt.setName('niche').setDescription('Target niche or industry').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('script')
        .setDescription('Generate a structured 30-45s direct response video script')
        .addStringOption(opt => opt.setName('prompt').setDescription('Product or core offer').setRequired(true))
        .addStringOption(opt => opt.setName('niche').setDescription('Target niche').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('prompt')
        .setDescription('Generate cinematic Midjourney & Runway Gen-3 / Kling video prompts')
        .addStringOption(opt => opt.setName('prompt').setDescription('Visual concept to describe').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('ad')
        .setDescription('Generate a comprehensive video ad strategy and angle breakdown')
        .addStringOption(opt => opt.setName('prompt').setDescription('Offer and value proposition').setRequired(true))
        .addStringOption(opt => opt.setName('niche').setDescription('Target niche').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('storyboard')
        .setDescription('Generate scene-by-scene visual and camera breakdown')
        .addStringOption(opt => opt.setName('prompt').setDescription('Ad concept or theme').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('caption')
        .setDescription('Generate high-CTR social ad captions with hashtags')
        .addStringOption(opt => opt.setName('prompt').setDescription('Target campaign message').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('cta')
        .setDescription('Generate 5 irresistible Call-To-Action variations')
        .addStringOption(opt => opt.setName('prompt').setDescription('Offer details').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('voiceover')
        .setDescription('Generate energetic voiceover script with pacing & tone guidance')
        .addStringOption(opt => opt.setName('prompt').setDescription('Voiceover script topic').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Check Premium role
    const hasPremium = await requirePremium(interaction);
    if (!hasPremium) return;

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

    const command = interaction.options.getSubcommand() as AiTaskType;
    const prompt = interaction.options.getString('prompt', true);
    const niche = interaction.options.getString('niche') || undefined;

    try {
      const result = await aiService.generate({
        userId: user.id,
        command,
        prompt,
        niche,
      });

      const embed = createSuccessEmbed(
        `🤖 Academy AI: /ai ${command}`,
        `${result.output}\n\n` +
        `📊 *Daily Quota Remaining: **${result.remainingQuota}** generations*`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [createErrorEmbed('AI Generation Failed', error.message || 'Error generating AI output')],
      });
    }
  },
};
