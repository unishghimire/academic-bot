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
     * Sweeps expired subscriptions where expiresAt has passed.
     * Critical guarantee: Never deletes lesson_progress, quiz_attempts, XP events, streaks, or achievements!
     */
    sweepExpiredSubscriptions(): Promise<string[]>;
    /**
     * Finds users whose subscriptions expire within a given window (e.g. 7 days, 3 days, 24 hours)
     * for throttled notifications.
     */
    findExpiringUsers(withinHours: number): Promise<Array<{
        id: string;
        discordId: string | null;
        email: string;
        expiresAt: Date;
    }>>;
}
export declare const subscriptionService: SubscriptionService;
