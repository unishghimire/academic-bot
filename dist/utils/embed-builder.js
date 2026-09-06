"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBaseEmbed = createBaseEmbed;
exports.createSuccessEmbed = createSuccessEmbed;
exports.createWarningEmbed = createWarningEmbed;
exports.createErrorEmbed = createErrorEmbed;
exports.createInfoEmbed = createInfoEmbed;
exports.createTierEmbed = createTierEmbed;
const discord_js_1 = require("discord.js");
const constants_js_1 = require("../config/constants.js");
function createBaseEmbed(title, color = constants_js_1.COLORS.PRIMARY) {
    return new discord_js_1.EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setFooter(constants_js_1.EMBED_FOOTER)
        .setTimestamp();
}
function createSuccessEmbed(title, description) {
    return createBaseEmbed(`✅ ${title}`, constants_js_1.COLORS.SUCCESS)
        .setDescription(description);
}
function createWarningEmbed(title, description) {
    return createBaseEmbed(`⚠️ ${title}`, constants_js_1.COLORS.WARNING)
        .setDescription(description);
}
function createErrorEmbed(title, description) {
    return createBaseEmbed(`❌ ${title}`, constants_js_1.COLORS.DANGER)
        .setDescription(description);
}
function createInfoEmbed(title, description) {
    return createBaseEmbed(`ℹ️ ${title}`, constants_js_1.COLORS.PRIMARY)
        .setDescription(description);
}
function createTierEmbed(tier, description) {
    const titles = {
        1: '🎓 Tier 1: Fundamentals of AI Video Ads',
        2: '🚀 Tier 2: Advanced AI Prompting & Workflows',
        3: '💎 Tier 3: Mastery & Agency Scale Campaigns',
        4: '🏆 Academy Graduate',
    };
    const color = tier === 4 ? constants_js_1.COLORS.GOLD : constants_js_1.COLORS.PRIMARY;
    return createBaseEmbed(titles[tier] || `Tier ${tier}`, color)
        .setDescription(description);
}
//# sourceMappingURL=embed-builder.js.map