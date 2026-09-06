import { PrismaClient } from '@prisma/client';
export interface LeaderboardEntry {
    rank: number;
    userId: string;
    discordId: string | null;
    totalXp: number;
    currentTier: number;
    streakCount: number;
}
export declare class XpService {
    private db;
    constructor(db?: PrismaClient);
    /**
     * Appends an event to the immutable XP ledger.
     * Total XP is always derived, never a mutable counter.
     */
    awardXp(userId: string, amount: number, reason: string, refType?: string, refId?: string): Promise<number>;
    /**
     * Derives total XP via SQL SUM aggregation
     */
    getUserTotalXp(userId: string): Promise<number>;
    /**
     * Updates streak count when a qualifying learning action occurs (video watch, quiz, project submission).
     */
    recordActivity(userId: string): Promise<{
        streakCount: number;
        streakExtended: boolean;
    }>;
    /**
     * Evaluates milestone achievements and unlocks newly earned badges
     */
    evaluateAchievements(userId: string): Promise<string[]>;
    /**
     * Fetches the academy leaderboard with privacy opt-out filter
     */
    getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
}
export declare const xpService: XpService;
