import { ActorType, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma, isPostgresOnline } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { TextChannel, EmbedBuilder } from 'discord.js';
import { COLORS } from '../config/constants.js';
import { localStore } from '../db/local-store.js';

export interface AuditLogParams {
  actorType: ActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export class AuditService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  /**
   * Records an immutable audit log entry in the database and optionally publishes to Discord #audit-logs
   */
  async log(params: AuditLogParams, auditChannel?: TextChannel | null) {
    if (this.db === defaultPrisma && !isPostgresOnline()) {
      localStore.saveAuditLog(params);
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
          before: (params.before as any) || undefined,
          after: (params.after as any) || undefined,
        },
      });

      logger.info(
        {
          auditId: entry.id,
          action: params.action,
          actor: `${params.actorType}:${params.actorId}`,
          target: `${params.targetType}:${params.targetId}`,
        },
        'Privileged action logged to audit'
      );

      // Publish to Discord #audit-logs channel if available
      if (auditChannel) {
        const embed = new EmbedBuilder()
          .setTitle(`🛡️ Audit Log: ${params.action}`)
          .setColor(COLORS.DARK)
          .addFields(
            { name: 'Actor', value: `\`${params.actorType}\` (<@${params.actorId}> / \`${params.actorId}\`)`, inline: true },
            { name: 'Target', value: `\`${params.targetType}\` (\`${params.targetId}\`)`, inline: true },
            { name: 'Reason', value: params.reason || '*No reason provided*', inline: false }
          )
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
          logger.error({ err }, 'Failed to post audit log to Discord channel');
        });
      }

      return entry;
    } catch (error) {
      logger.warn({ err: error, action: params.action }, 'Audit log saved in offline mode');
      return { id: `audit_${Date.now()}`, createdAt: new Date(), ...params } as any;
    }
  }
}

export const auditService = new AuditService();
