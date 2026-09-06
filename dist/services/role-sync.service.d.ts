import { Client } from 'discord.js';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
export interface SyncResult {
    userId: string;
    discordId: string;
    rolesAdded: string[];
    rolesRemoved: string[];
    unchanged: boolean;
}
export declare class RoleSyncService {
    private db;
    constructor(db?: PrismaClient);
    /**
     * Derives the set of managed Academy role IDs a user should possess based on DB state.
     */
    computeExpectedRoles(user: {
        subscriptionStatus: SubscriptionStatus;
        currentTier: number;
    }): {
        expectedRoleIds: Set<string>;
        prohibitedRoleIds: Set<string>;
    };
    /**
     * Synchronizes a single member's Discord roles with the database state.
     * Completely idempotent: running twice in a row causes 0 role mutations on the second run.
     */
    syncUserRoles(userId: string, client: Client): Promise<SyncResult | null>;
    /**
     * Full sweep across all linked users in the database
     */
    syncAllLinkedUsers(client: Client): Promise<{
        total: number;
        corrected: number;
    }>;
}
export declare const roleSyncService: RoleSyncService;
