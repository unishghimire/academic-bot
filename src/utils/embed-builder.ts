import { EmbedBuilder } from 'discord.js';
import { COLORS, EMBED_FOOTER } from '../config/constants.js';

export function createBaseEmbed(title: string, color: number = COLORS.PRIMARY): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setFooter(EMBED_FOOTER)
    .setTimestamp();
}

export function createSuccessEmbed(title: string, description: string): EmbedBuilder {
  return createBaseEmbed(`✅ ${title}`, COLORS.SUCCESS)
    .setDescription(description);
}

export function createWarningEmbed(title: string, description: string): EmbedBuilder {
  return createBaseEmbed(`⚠️ ${title}`, COLORS.WARNING)
    .setDescription(description);
}

export function createErrorEmbed(title: string, description: string): EmbedBuilder {
  return createBaseEmbed(`❌ ${title}`, COLORS.DANGER)
    .setDescription(description);
}

export function createInfoEmbed(title: string, description: string): EmbedBuilder {
  return createBaseEmbed(`ℹ️ ${title}`, COLORS.PRIMARY)
    .setDescription(description);
}

export function createTierEmbed(tier: number, description: string): EmbedBuilder {
  const titles: Record<number, string> = {
    1: '🎓 Tier 1: Fundamentals of AI Video Ads',
    2: '🚀 Tier 2: Advanced AI Prompting & Workflows',
    3: '💎 Tier 3: Mastery & Agency Scale Campaigns',
    4: '🏆 Academy Graduate',
  };
  const color = tier === 4 ? COLORS.GOLD : COLORS.PRIMARY;
  return createBaseEmbed(titles[tier] || `Tier ${tier}`, color)
    .setDescription(description);
}
