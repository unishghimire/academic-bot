import { ChatInputCommandInteraction } from 'discord.js';

/**
 * Checks whether an error represents an expired or already-acknowledged interaction.
 * - 40060: Interaction has already been acknowledged
 * - 10062: Unknown interaction (expired past the 3-second limit or invalid token)
 */
export function isIgnorableInteractionError(error: any): boolean {
  const code = error?.code || error?.rawError?.code;
  const msg = error?.message || '';
  return (
    code === 40060 ||
    code === 10062 ||
    msg.includes('already been acknowledged') ||
    msg.includes('Unknown interaction')
  );
}

/**
 * Safely defers a Discord chat input command interaction.
 * If the interaction has already been acknowledged or expired (>3s),
 * it catches DiscordAPIError 40060 and 10062 and returns false so the caller can exit gracefully.
 */
export async function safeDeferReply(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean = true
): Promise<boolean> {
  if (interaction.deferred || interaction.replied) {
    return true;
  }

  try {
    await interaction.deferReply({ ephemeral });
    return true;
  } catch (error: any) {
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
export async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  options: any
): Promise<boolean> {
  try {
    await interaction.editReply(options);
    return true;
  } catch (error: any) {
    if (isIgnorableInteractionError(error)) {
      return false;
    }
    throw error;
  }
}
