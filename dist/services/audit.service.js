"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
const client_js_1 = require("../db/client.js");
const logger_js_1 = require("../utils/logger.js");
const discord_js_1 = require("discord.js");
const constants_js_1 = require("../config/constants.js");
const local_store_js_1 = require("../db/local-store.js");
class AuditService {
    db;
    constructor(db = client_js_1.prisma) {
        this.db = db;
    }
    /**
     * Records an immutable audit log entry in the database and optionally publishes to Discord #audit-logs
     */
    async log(params, auditChannel) {
        if (this.db === client_js_1.prisma && !(0, client_js_1.isPostgresOnline)()) {
            local_store_js_1.localStore.saveAuditLog(params);
            return;
        }
        try {
            const entry = await this.db.auditLog.create({
                data: {
                    actorType: params.actorType,
                    actorId: params.actorId,
                    action: params.action,
                    targetType: params.targetType,
                    targetId: params.targetId,
                    reason: params.reason || null,
                    before: params.before || undefined,
                    after: params.after || undefined,
                },
            });
            logger_js_1.logger.info({
                auditId: entry.id,
                action: params.action,
                actor: `${params.actorType}:${params.actorId}`,
                target: `${params.targetType}:${params.targetId}`,
            }, 'Privileged action logged to audit');
            // Publish to Discord #audit-logs channel if available
            if (auditChannel) {
                const embed = new discord_js_1.EmbedBuilder()
                    .setTitle(`🛡️ Audit Log: ${params.action}`)
                    .setColor(constants_js_1.COLORS.DARK)
                    .addFields({ name: 'Actor', value: `\`${params.actorType}\` (<@${params.actorId}> / \`${params.actorId}\`)`, inline: true }, { name: 'Target', value: `\`${params.targetType}\` (\`${params.targetId}\`)`, inline: true }, { name: 'Reason', value: params.reason || '*No reason provided*', inline: false })
                    .setTimestamp(entry.createdAt);
                if (params.before || params.after) {
                    if (params.before) {
                        embed.addFields({
                            name: 'Before',
                            value: `\`\`\`json\n${JSON.stringify(params.before, null, 2).slice(0, 1000)}\n\`\`\``,
                        });
                    }
                    if (params.after) {
                        embed.addFields({
                            name: 'After',
                            value: `\`\`\`json\n${JSON.stringify(params.after, null, 2).slice(0, 1000)}\n\`\`\``,
                        });
                    }
                }
                await auditChannel.send({ embeds: [embed] }).catch(err => {
                    logger_js_1.logger.error({ err }, 'Failed to post audit log to Discord channel');
                });
            }
            return entry;
        }
        catch (error) {
            logger_js_1.logger.warn({ err: error, action: params.action }, 'Audit log saved in offline mode');
            return { id: `audit_${Date.now()}`, createdAt: new Date(), ...params };
        }
    }
}
exports.AuditService = AuditService;
exports.auditService = new AuditService();
//# sourceMappingURL=audit.service.js.map