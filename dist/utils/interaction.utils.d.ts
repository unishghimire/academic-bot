import { ChatInputCommandInteraction } from 'discord.js';
/**
 * Checks whether an error represents an expired or already-acknowledged interaction.
 * - 40060: Interaction has already been acknowledged
 * - 10062: Unknown interaction (expired past the 3-second limit or invalid token)
 */
export declare function isIgnorableInteractionError(error: any): boolean;
/**
 * Safely defers a Discord chat input command interaction.
 * If the interaction has already been acknowledged or expired (>3s),
 * it catches DiscordAPIError 40060 and 10062 and returns false so the caller can exit gracefully.
 */
export declare function safeDeferReply(interaction: ChatInputCommandInteraction, ephemeral?: boolean): Promise<boolean>;
/**
 * Safely edits the reply of a deferred interaction.
 * Suppresses 40060 and 10062 errors if the interaction timed out or was handled elsewhere.
 */
export declare function safeEditReply(interaction: ChatInputCommandInteraction, options: any): Promise<boolean>;
