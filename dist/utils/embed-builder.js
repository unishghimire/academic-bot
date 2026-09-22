import { EmbedBuilder } from 'discord.js';
import { COLORS, EMBED_FOOTER } from '../config/constants.js';
export function createBaseEmbed(title, color = COLORS.PRIMARY) {
    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setFooter(EMBED_FOOTER)
        .setTimestamp();
}
export function createSuccessEmbed(title, description) {
    return createBaseEmbed(`✅ ${title}`, COLORS.SUCCESS)
        .setDescription(description);
}
export function createWarningEmbed(title, description) {
    return createBaseEmbed(`⚠️ ${title}`, COLORS.WARNING)
        .setDescription(description);
}
export function createErrorEmbed(title, description) {
    return createBaseEmbed(`❌ ${title}`, COLORS.DANGER)
        .setDescription(description);
}
export function createInfoEmbed(title, description) {
    return createBaseEmbed(`ℹ️ ${title}`, COLORS.PRIMARY)
        .setDescription(description);
}
export function createTierEmbed(tier, description) {
    const titles = {
        1: '🎓 Tier 1: Fundamentals of AI Video Ads',
        2: '🚀 Tier 2: Advanced AI Prompting & Workflows',
        3: '💎 Tier 3: Mastery & Agency Scale Campaigns',
        4: '🏆 Academy Graduate',
    };
    const color = tier === 4 ? COLORS.GOLD : COLORS.PRIMARY;
    return createBaseEmbed(titles[tier] || `Tier ${tier}`, color)
        .setDescription(description);
}
//# sourceMappingURL=embed-builder.js.map