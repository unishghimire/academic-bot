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
     * Evaluates membership access for a user.
     * In the single Elite role model, all active subscriptions grant Elite access (1).
     * Multi-tier ladder progression has been removed.
     */
    evaluateTier(userId: string): Promise<TierEvaluationResult>;
    /**
     * Admin tier override stub (audited)
     */
    applyAdminOverride(userId: string, targetTier: number, adminId: string, reason: string): Promise<void>;
}
export declare const tierEngine: TierEngineService;
