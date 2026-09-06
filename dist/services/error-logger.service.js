"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.ErrorLoggerService = void 0;
const discord_js_1 = require("discord.js");
const constants_js_1 = require("../config/constants.js");
const env_js_1 = require("../config/env.js");
const logger_js_1 = require("../utils/logger.js");
class ErrorLoggerService {
    /**
     * Sanitizes errors to prevent exposing internal tokens, passwords, or connection strings.
     */
    sanitize(message) {
        return message
            .replace(/postgres:\/\/[^@]+@/gi, 'postgres://***:***@')
            .replace(/sk_[a-zA-Z0-9_-]+/gi, 'sk_***')
            .replace(/whsec_[a-zA-Z0-9_-]+/gi, 'whsec_***')
            .replace(/Bot\s+[a-zA-Z0-9._-]+/gi, 'Bot ***');
    }
    /**
     * Reports sanitized error to internal logger and Discord #error-logs channel
     */
    async report(client, params) {
        const rawError = params.error instanceof Error ? params.error.stack || params.error.message : String(params.error);
        const sanitizedError = this.sanitize(rawError);
        logger_js_1.logger.error({
            module: params.module,
            action: params.action,
            userId: params.userId,
            discordId: params.discordId,
            error: sanitizedError,
            metadata: params.metadata,
        }, `Error in ${params.module} during ${params.action}`);
        if (!client || !env_js_1.env.CHANNEL_ERROR_LOGS) {
            return;
        }
        try {
            const channel = await client.channels.fetch(env_js_1.env.CHANNEL_ERROR_LOGS).catch(() => null);
            if (channel && channel.isTextBased()) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle(`🚨 Error Alert: ${params.module}`)
                    .setColor(constants_js_1.COLORS.DANGER)
                    .addFields({ name: 'Action', value: `\`${params.action}\``, inline: true }, { name: 'User Reference', value: params.userId ? `\`${params.userId}\`` : params.discordId ? `<@${params.discordId}>` : '*N/A*', inline: true }, { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }, {
                    name: 'Error Summary',
                    value: `\`\`\`${sanitizedError.slice(0, 1000)}\`\`\``,
                })
                    .setTimestamp();
                if (params.metadata) {
                    embed.addFields({
                        name: 'Context Metadata',
                        value: `\`\`\`json\n${JSON.stringify(params.metadata, null, 2).slice(0, 800)}\n\`\`\``,
                    });
                }
                await channel.send({ embeds: [embed] }).catch(() => { });
            }
        }
        catch (err) {
            logger_js_1.logger.error({ err }, 'Failed to dispatch error report to Discord #error-logs channel');
        }
    }
}
exports.ErrorLoggerService = ErrorLoggerService;
exports.errorLogger = new ErrorLoggerService();
//# sourceMappingURL=error-logger.service.js.map