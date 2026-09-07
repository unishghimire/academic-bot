"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDeferReply = safeDeferReply;
/**
 * Safely defers a Discord chat input command interaction.
 * If the interaction has already been acknowledged (e.g., due to duplicate events,
 * rapid double clicks, or multiple bot instances running simultaneously), it catches
 * DiscordAPIError 40060 and returns false so the caller can exit gracefully.
 */
async function safeDeferReply(interaction, ephemeral = true) {
    if (interaction.deferred || interaction.replied) {
        return true;
    }
    try {
        await interaction.deferReply({ ephemeral });
        return true;
    }
    catch (error) {
        if (error?.code === 40060 ||
            error?.rawError?.code === 40060 ||
            error?.message?.includes('already been acknowledged')) {
            return false;
        }
        throw error;
    }
}
//# sourceMappingURL=interaction.utils.js.map