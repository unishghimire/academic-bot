import { ChatInputCommandInteraction } from 'discord.js';
/**
 * Safely defers a Discord chat input command interaction.
 * If the interaction has already been acknowledged (e.g., due to duplicate events,
 * rapid double clicks, or multiple bot instances running simultaneously), it catches
 * DiscordAPIError 40060 and returns false so the caller can exit gracefully.
 */
export declare function safeDeferReply(interaction: ChatInputCommandInteraction, ephemeral?: boolean): Promise<boolean>;
