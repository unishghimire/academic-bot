"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIgnorableInteractionError = isIgnorableInteractionError;
exports.safeDeferReply = safeDeferReply;
exports.safeEditReply = safeEditReply;
/**
 * Checks whether an error represents an expired or already-acknowledged interaction.
 * - 40060: Interaction has already been acknowledged
 * - 10062: Unknown interaction (expired past the 3-second limit or invalid token)
 */
function isIgnorableInteractionError(error) {
    const code = error?.code || error?.rawError?.code;
    const msg = error?.message || '';
    return (code === 40060 ||
        code === 10062 ||
        msg.includes('already been acknowledged') ||
        msg.includes('Unknown interaction'));
}
/**
 * Safely defers a Discord chat input command interaction.
 * If the interaction has already been acknowledged or expired (>3s),
 * it catches DiscordAPIError 40060 and 10062 and returns false so the caller can exit gracefully.
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
        if (isIgnorableInteractionError(error)) {
            return false;
        }
        throw error;
    }
}
/**
 * Safely edits the reply of a deferred interaction.
 * Suppresses 40060 and 10062 errors if the interaction timed out or was handled elsewhere.
 */
async function safeEditReply(interaction, options) {
    try {
        await interaction.editReply(options);
        return true;
    }
    catch (error) {
        if (isIgnorableInteractionError(error)) {
            return false;
        }
        throw error;
    }
}
//# sourceMappingURL=interaction.utils.js.map