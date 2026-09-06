import { PrismaClient } from '@prisma/client';
export interface CompletionResult {
    lessonId: string;
    userId: string;
    completed: boolean;
    videoCompleted: boolean;
    quizPassed: boolean;
    assignmentApproved: boolean;
    newlyCompleted: boolean;
    xpAwarded: number;
    tierUnlocked?: number;
}
export declare class ProgressService {
    private db;
    constructor(db?: PrismaClient);
    /**
     * Records video watch percentage reported directly from the course website video player.
     * Discord presentation layer NEVER guesses or mocks video watch percentage.
     */
    updateWatchProgress(userId: string, lessonId: string, watchPercent: number): Promise<CompletionResult>;
    /**
     * Central rule check for lesson completion: video + quiz + assignment.
     */
    evaluateLessonCompletion(userId: string, lessonId: string): Promise<CompletionResult>;
    /**
     * Retrieves overall course progress for a user across all tiers
     */
    getUserProgressSummary(userId: string): Promise<{
        userId: string;
        discordId: string | null;
        currentTier: number;
        totalXp: number;
        streakCount: number;
        overallPercentage: number;
        totalLessons: number;
        totalCompleted: number;
        tierStats: {
            tier: number;
            totalLessons: number;
            completedLessons: number;
            percentage: number;
        }[];
    }>;
}
export declare const progressService: ProgressService;
