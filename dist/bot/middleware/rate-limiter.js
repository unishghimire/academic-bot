"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRateLimit = checkRateLimit;
const discord_js_1 = require("discord.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
// userId -> (commandName -> lastTimestamp)
const cooldowns = new discord_js_1.Collection();
function checkRateLimit(interaction, cooldownSeconds = 3) {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;
    if (!cooldowns.has(commandName)) {
        cooldowns.set(commandName, new discord_js_1.Collection());
    }
    const timestamps = cooldowns.get(commandName);
    const now = Date.now();
    const cooldownAmount = cooldownSeconds * 1000;
    if (timestamps.has(userId)) {
        const expirationTime = timestamps.get(userId) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = Math.ceil((expirationTime - now) / 1000);
            interaction.reply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Slow Down', `Please wait ${timeLeft} more second(s) before running \`/${commandName}\` again.`)],
                ephemeral: true,
            });
            return false;
        }
    }
    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);
    return true;
}
//# sourceMappingURL=rate-limiter.js.map