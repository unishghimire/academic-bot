import { Collection } from 'discord.js';
import { createWarningEmbed } from '../../utils/embed-builder.js';
// userId -> (commandName -> lastTimestamp)
const cooldowns = new Collection();
export function checkRateLimit(interaction, cooldownSeconds = 3) {
    const userId = interaction.user.id;
    const commandName = interaction.commandName;
    if (!cooldowns.has(commandName)) {
        cooldowns.set(commandName, new Collection());
    }
    const timestamps = cooldowns.get(commandName);
    const now = Date.now();
    const cooldownAmount = cooldownSeconds * 1000;
    if (timestamps.has(userId)) {
        const expirationTime = timestamps.get(userId) + cooldownAmount;
        if (now < expirationTime) {
            const timeLeft = Math.ceil((expirationTime - now) / 1000);
            interaction.reply({
                embeds: [createWarningEmbed('Slow Down', `Please wait ${timeLeft} more second(s) before running \`/${commandName}\` again.`)],
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