import { PrismaClient } from '@prisma/client';
import { AuditService } from './audit.service.js';
export interface TierEvaluationResult {
    userId: string;
    previousTier: number;
    eligibleTier: number;
    unlocked: boolean;
    activeSubscription: boolean;
    tier1Progress: {
        totalLessons: number;
        completedLessons: number;
        projectApproved: boolean;
        complete: boolean;
    };
    tier2Progress: {
        totalLessons: number;
        completedLessons: number;
        projectApproved: boolean;
        complete: boolean;
    };
    tier3Progress: {
        totalLessons: number;
        completedLessons: number;
        complete: boolean;
    };
}
export declare class TierEngineService {
    private db;
    private auditor;
    constructor(db?: PrismaClient, auditor?: AuditService);
    /**
     * Evaluates tier progression for a user based on active database records.
     * This central rule evaluator is the ONLY code path allowed to calculate tier access.
     */
    evaluateTier(userId: string): Promise<TierEvaluationResult>;
    /**
     * Handles admin overrides by recording an exception in the audit log and forcing a tier update
     */
    applyAdminOverride(userId: string, targetTier: number, adminId: string, reason: string): Promise<void>;
}
export declare const tierEngine: TierEngineService;
