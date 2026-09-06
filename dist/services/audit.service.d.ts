import { ActorType, PrismaClient } from '@prisma/client';
import { TextChannel } from 'discord.js';
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
export declare class AuditService {
    private db;
    constructor(db?: PrismaClient);
    /**
     * Records an immutable audit log entry in the database and optionally publishes to Discord #audit-logs
     */
    log(params: AuditLogParams, auditChannel?: TextChannel | null): Promise<any>;
}
export declare const auditService: AuditService;
