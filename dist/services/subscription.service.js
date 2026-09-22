import { SubscriptionStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/client.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';
import { localStore } from '../db/local-store.js';
import { getSupabaseClient } from '../db/supabase.js';
export class SubscriptionService {
    db;
    auditor;
    constructor(db = defaultPrisma, auditor = auditService) {
        this.db = db;
        this.auditor = auditor;
    }
    /**
     * Translates Stripe subscription status string into the Academy SubscriptionStatus enum
     */
    mapStripeStatus(stripeStatus) {
        switch (stripeStatus) {
            case 'active':
            case 'trialing':
                return SubscriptionStatus.ACTIVE;
            case 'past_due':
                return SubscriptionStatus.PAST_DUE;
            case 'canceled':
            case 'unpaid':
                return SubscriptionStatus.CANCELLED;
            case 'incomplete':
            case 'incomplete_expired':
            case 'paused':
            default:
                return SubscriptionStatus.PENDING;
        }
    }
    /**
     * Processes a verified webhook subscription payload and updates the database.
     * Never derives subscription state from Discord claims.
     */
    async handleSubscriptionUpdated(params) {
        // Find user by email or existing subscription
        let user = await this.db.user.findFirst({
            where: {
                OR: [
                    { email: params.email },
                    { subscriptions: { some: { providerRef: params.providerRef } } },
                ],
            },
            include: { subscriptions: true },
        });
        if (!user) {
            // Create student user record if first-time purchase
            user = await this.db.user.create({
                data: {
                    email: params.email,
                    accountId: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    subscriptionStatus: params.status,
                    subscriptionExpiresAt: params.expiresAt,
                    currentTier: 1,
                },
                include: { subscriptions: true },
            });
            logger.info({ userId: user.id, email: params.email }, 'Created new student user record from verified payment');
        }
        const previousStatus = user.subscriptionStatus;
        // Update user subscription state
        await this.db.user.update({
            where: { id: user.id },
            data: {
                subscriptionStatus: params.status,
                subscriptionExpiresAt: params.expiresAt,
            },
        });
        // Upsert subscription record
        await this.db.subscription.upsert({
            where: { providerRef: params.providerRef },
            create: {
                userId: user.id,
                plan: params.plan,
                status: params.status,
                providerRef: params.providerRef,
                startedAt: params.startedAt,
                expiresAt: params.expiresAt,
                cancelledAt: params.cancelledAt,
                renewedAt: params.status === SubscriptionStatus.ACTIVE && previousStatus !== SubscriptionStatus.ACTIVE ? new Date() : null,
            },
            update: {
                plan: params.plan,
                status: params.status,
                expiresAt: params.expiresAt,
                cancelledAt: params.cancelledAt,
                renewedAt: params.status === SubscriptionStatus.ACTIVE && previousStatus !== SubscriptionStatus.ACTIVE ? new Date() : undefined,
            },
        });
        // Record immutable audit entry
        await this.auditor.log({
            actorType: 'SYSTEM',
            actorId: 'STRIPE_WEBHOOK',
            action: 'SUBSCRIPTION_STATE_CHANGED',
            targetType: 'USER',
            targetId: user.id,
            reason: `Webhook received for providerRef ${params.providerRef}. Status transition: ${previousStatus} -> ${params.status}`,
            before: { status: previousStatus },
            after: { status: params.status, expiresAt: params.expiresAt },
        });
        logger.info({ userId: user.id, providerRef: params.providerRef, from: previousStatus, to: params.status }, 'Updated student subscription state');
        return { userId: user.id, status: params.status };
    }
    /**
     * Sweeps expired subscriptions across PostgreSQL, Supabase, and local storage.
     * Returns rich user metadata for role removal and DM notifications.
     * Invariant: Never deletes lesson_progress, quiz_attempts, XP events, streaks, or achievements!
     */
    async sweepExpiredSubscriptionsDetailed() {
        const now = new Date();
        const sweptUsers = [];
        const seenIds = new Set();
        // 1. Prisma PostgreSQL (or mockDb in tests)
        try {
            if (this.db?.user?.findMany) {
                const expiredUsers = await this.db.user.findMany({
                    where: {
                        subscriptionStatus: SubscriptionStatus.ACTIVE,
                        subscriptionExpiresAt: {
                            not: null,
                            lte: now,
                        },
                    },
                });
                for (const user of expiredUsers) {
                    await this.db.user.update({
                        where: { id: user.id },
                        data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
                    }).catch(() => { });
                    if (this.db.subscription?.updateMany) {
                        await this.db.subscription.updateMany({
                            where: { userId: user.id, status: SubscriptionStatus.ACTIVE },
                            data: { status: SubscriptionStatus.EXPIRED },
                        }).catch(() => { });
                    }
                    await this.auditor.log({
                        actorType: 'SYSTEM',
                        actorId: 'EXPIRY_SWEEP_JOB',
                        action: 'SUBSCRIPTION_EXPIRED',
                        targetType: 'USER',
                        targetId: user.id,
                        reason: `Subscription expiration timestamp (${user.subscriptionExpiresAt?.toISOString()}) elapsed. Progress rows preserved.`,
                        before: { status: SubscriptionStatus.ACTIVE },
                        after: { status: SubscriptionStatus.EXPIRED },
                    }).catch(() => { });
                    seenIds.add(user.id);
                    if (user.discordId)
                        seenIds.add(user.discordId);
                    sweptUsers.push({
                        id: user.id,
                        discordId: user.discordId || null,
                        email: user.email,
                        expiresAt: user.subscriptionExpiresAt || now,
                        tier: user.currentTier || 1,
                    });
                }
            }
        }
        catch (err) {
            logger.debug({ err }, 'Prisma sweep query bypassed or offline');
        }
        // 2. Resilient localStore check
        try {
            const localUsers = localStore.getUsers() || [];
            for (const lu of localUsers) {
                if (lu.subscriptionStatus === SubscriptionStatus.ACTIVE &&
                    lu.subscriptionExpiresAt &&
                    new Date(lu.subscriptionExpiresAt).getTime() <= now.getTime()) {
                    lu.subscriptionStatus = SubscriptionStatus.EXPIRED;
                    localStore.saveUser(lu);
                    if (!seenIds.has(lu.id) && (!lu.discordId || !seenIds.has(lu.discordId))) {
                        seenIds.add(lu.id);
                        if (lu.discordId)
                            seenIds.add(lu.discordId);
                        sweptUsers.push({
                            id: lu.id,
                            discordId: lu.discordId || null,
                            email: lu.email,
                            expiresAt: new Date(lu.subscriptionExpiresAt),
                            tier: lu.currentTier || 1,
                        });
                    }
                }
            }
        }
        catch (err) {
            logger.debug({ err }, 'localStore expiry check error');
        }
        // 3. Supabase payment_verifications check
        const supabase = getSupabaseClient();
        if (supabase) {
            try {
                const { data: verifs } = await supabase
                    .from('payment_verifications')
                    .select('*')
                    .in('status', ['approved', 'verified', 'Verified', 'Approved', 'VERIFIED', 'APPROVED']);
                if (verifs && verifs.length > 0) {
                    for (const rec of verifs) {
                        const baseDate = rec.created_at ? new Date(rec.created_at) : now;
                        const duration = rec.access_duration_days || 30;
                        const expiresAt = rec.expires_at
                            ? new Date(rec.expires_at)
                            : new Date(baseDate.getTime() + duration * 86400000);
                        if (expiresAt.getTime() <= now.getTime()) {
                            // Update status to expired in Supabase
                            try {
                                await supabase
                                    .from('payment_verifications')
                                    .update({ status: 'expired' })
                                    .eq('id', rec.id);
                            }
                            catch {
                                // Ignore Supabase update error
                            }
                            // Update localStore user if present
                            if (rec.discord_id) {
                                const u = localStore.findUserByDiscordId(rec.discord_id);
                                if (u && u.subscriptionStatus === SubscriptionStatus.ACTIVE) {
                                    u.subscriptionStatus = SubscriptionStatus.EXPIRED;
                                    localStore.saveUser(u);
                                }
                            }
                            const identifier = rec.discord_id || rec.id;
                            if (!seenIds.has(rec.id) && (!rec.discord_id || !seenIds.has(rec.discord_id))) {
                                seenIds.add(rec.id);
                                if (rec.discord_id)
                                    seenIds.add(rec.discord_id);
                                sweptUsers.push({
                                    id: rec.id,
                                    discordId: rec.discord_id || null,
                                    email: rec.email,
                                    expiresAt,
                                    tier: rec.tier_number || 1,
                                });
                            }
                        }
                    }
                }
            }
            catch (err) {
                logger.debug({ err }, 'Supabase expiry sweep check encountered error');
            }
        }
        if (sweptUsers.length > 0) {
            logger.info({ count: sweptUsers.length }, 'Expired subscriptions swept. Student progress preserved.');
        }
        return sweptUsers;
    }
    /**
     * Sweeps expired subscriptions and returns array of swept user IDs.
     * Backward-compatible with existing test suites.
     */
    async sweepExpiredSubscriptions() {
        const detailed = await this.sweepExpiredSubscriptionsDetailed();
        return detailed.map(u => u.id);
    }
    /**
     * Finds active users whose subscriptions expire within a given window (e.g. 72 hours for 3 days notice)
     * across PostgreSQL, Supabase, and local storage.
     */
    async findExpiringUsers(withinHours) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
        const expiringUsers = [];
        const seenDiscordIds = new Set();
        // 1. Prisma PostgreSQL (or mockDb in tests)
        try {
            if (this.db?.user?.findMany) {
                const users = await this.db.user.findMany({
                    where: {
                        subscriptionStatus: SubscriptionStatus.ACTIVE,
                        subscriptionExpiresAt: {
                            gt: now,
                            lte: windowEnd,
                        },
                    },
                    select: {
                        id: true,
                        discordId: true,
                        email: true,
                        subscriptionExpiresAt: true,
                        currentTier: true,
                    },
                });
                for (const u of users) {
                    if (u.subscriptionExpiresAt) {
                        const expDate = new Date(u.subscriptionExpiresAt);
                        const hoursRemaining = Math.max(0, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                        if (u.discordId)
                            seenDiscordIds.add(u.discordId);
                        expiringUsers.push({
                            id: u.id,
                            discordId: u.discordId,
                            email: u.email,
                            expiresAt: expDate,
                            tier: u.currentTier || 1,
                            hoursRemaining,
                        });
                    }
                }
            }
        }
        catch {
            // Offline fallback
        }
        // 2. localStore check
        try {
            const localUsers = localStore.getUsers() || [];
            for (const lu of localUsers) {
                if (lu.subscriptionStatus === SubscriptionStatus.ACTIVE &&
                    lu.subscriptionExpiresAt) {
                    const expDate = new Date(lu.subscriptionExpiresAt);
                    if (expDate > now && expDate <= windowEnd) {
                        if (!lu.discordId || !seenDiscordIds.has(lu.discordId)) {
                            if (lu.discordId)
                                seenDiscordIds.add(lu.discordId);
                            const hoursRemaining = Math.max(0, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                            expiringUsers.push({
                                id: lu.id,
                                discordId: lu.discordId || null,
                                email: lu.email,
                                expiresAt: expDate,
                                tier: lu.currentTier || 1,
                                hoursRemaining,
                            });
                        }
                    }
                }
            }
        }
        catch {
            // Ignore
        }
        // 3. Supabase check
        const supabase = getSupabaseClient();
        if (supabase) {
            try {
                const { data: verifs } = await supabase
                    .from('payment_verifications')
                    .select('*')
                    .in('status', ['approved', 'verified', 'Verified', 'Approved', 'VERIFIED', 'APPROVED']);
                if (verifs && verifs.length > 0) {
                    for (const rec of verifs) {
                        const baseDate = rec.created_at ? new Date(rec.created_at) : now;
                        const duration = rec.access_duration_days || 30;
                        const expDate = rec.expires_at
                            ? new Date(rec.expires_at)
                            : new Date(baseDate.getTime() + duration * 86400000);
                        if (expDate > now && expDate <= windowEnd) {
                            if (!rec.discord_id || !seenDiscordIds.has(rec.discord_id)) {
                                if (rec.discord_id)
                                    seenDiscordIds.add(rec.discord_id);
                                const hoursRemaining = Math.max(0, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                                expiringUsers.push({
                                    id: rec.id,
                                    discordId: rec.discord_id || null,
                                    email: rec.email,
                                    expiresAt: expDate,
                                    tier: rec.tier_number || 1,
                                    hoursRemaining,
                                });
                            }
                        }
                    }
                }
            }
            catch {
                // Ignore
            }
        }
        return expiringUsers;
    }
}
export const subscriptionService = new SubscriptionService();
//# sourceMappingURL=subscription.service.js.map