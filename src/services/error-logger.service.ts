import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { COLORS } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface ErrorReportParams {
  module: string;
  action: string;
  error: unknown;
  userId?: string;
  discordId?: string;
  metadata?: Record<string, unknown>;
}

export class ErrorLoggerService {
  /**
   * Sanitizes errors to prevent exposing internal tokens, passwords, or connection strings.
   */
  private sanitize(message: string): string {
    return message
      .replace(/postgres:\/\/[^@]+@/gi, 'postgres://***:***@')
      .replace(/sk_[a-zA-Z0-9_-]+/gi, 'sk_***')
      .replace(/whsec_[a-zA-Z0-9_-]+/gi, 'whsec_***')
      .replace(/Bot\s+[a-zA-Z0-9._-]+/gi, 'Bot ***');
  }

  /**
   * Reports sanitized error to internal logger and Discord #error-logs channel
   */
  async report(client: Client | null, params: ErrorReportParams) {
    const rawError = params.error instanceof Error ? params.error.stack || params.error.message : String(params.error);
    const sanitizedError = this.sanitize(rawError);

    logger.error(
      {
        module: params.module,
        action: params.action,
        userId: params.userId,
        discordId: params.discordId,
        error: sanitizedError,
        metadata: params.metadata,
      },
      `Error in ${params.module} during ${params.action}`
    );

    if (!client || !env.CHANNEL_ERROR_LOGS) {
      return;
    }

    try {
      const channel = await client.channels.fetch(env.CHANNEL_ERROR_LOGS).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`🚨 Error Alert: ${params.module}`)
          .setColor(COLORS.DANGER)
          .addFields(
            { name: 'Action', value: `\`${params.action}\``, inline: true },
            { name: 'User Reference', value: params.userId ? `\`${params.userId}\`` : params.discordId ? `<@${params.discordId}>` : '*N/A*', inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            {
              name: 'Error Summary',
              value: `\`\`\`${sanitizedError.slice(0, 1000)}\`\`\``,
            }
          )
          .setTimestamp();

        if (params.metadata) {
          embed.addFields({
            name: 'Context Metadata',
            value: `\`\`\`json\n${JSON.stringify(params.metadata, null, 2).slice(0, 800)}\n\`\`\``,
          });
        }

        await (channel as TextChannel).send({ embeds: [embed] }).catch(() => {});
      }
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch error report to Discord #error-logs channel');
    }
  }
}

export const errorLogger = new ErrorLoggerService();
