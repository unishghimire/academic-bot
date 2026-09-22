import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { AuditService } from './audit.service.js';
import type Stripe from 'stripe';
export interface ProcessSubscriptionParams {
    providerRef: string;
    email: string;
    plan: string;
    status: SubscriptionStatus;
    startedAt: Date;
    expiresAt: Date | null;
    cancelledAt?: Date | null;
}
export interface ExpiredUserSummary {
    id: string;
    discordId: string | null;
    email: string;
    expiresAt: Date;
    tier: number;
}
export interface ExpiringUserSummary {
    id: string;
    discordId: string | null;
    email: string;
    expiresAt: Date;
    tier: number;
    hoursRemaining: number;
}
export declare class SubscriptionService {
    private db;
    private auditor;
    constructor(db?: PrismaClient, auditor?: AuditService);
    /**
     * Translates Stripe subscription status string into the Academy SubscriptionStatus enum
     */
    mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus;
    /**
     * Processes a verified webhook subscription payload and updates the database.
     * Never derives subscription state from Discord claims.
     */
    handleSubscriptionUpdated(params: ProcessSubscriptionParams): Promise<{
        userId: string;
        status: SubscriptionStatus;
    }>;
    /**
     * Sweeps expired subscriptions across PostgreSQL, Supabase, and local storage.
     * Returns rich user metadata for role removal and DM notifications.
     * Invariant: Never deletes lesson_progress, quiz_attempts, XP events, streaks, or achievements!
     */
    sweepExpiredSubscriptionsDetailed(): Promise<ExpiredUserSummary[]>;
    /**
     * Sweeps expired subscriptions and returns array of swept user IDs.
     * Backward-compatible with existing test suites.
     */
    sweepExpiredSubscriptions(): Promise<string[]>;
    /**
     * Finds active users whose subscriptions expire within a given window (e.g. 72 hours for 3 days notice)
     * across PostgreSQL, Supabase, and local storage.
     */
    findExpiringUsers(withinHours: number): Promise<ExpiringUserSummary[]>;
}
export declare const subscriptionService: SubscriptionService;
