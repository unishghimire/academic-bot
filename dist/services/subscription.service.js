"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionService = exports.SubscriptionService = void 0;
const client_1 = require("@prisma/client");
const client_js_1 = require("../db/client.js");
const audit_service_js_1 = require("./audit.service.js");
const logger_js_1 = require("../utils/logger.js");
class SubscriptionService {
    db;
    auditor;
    constructor(db = client_js_1.prisma, auditor = audit_service_js_1.auditService) {
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
                return client_1.SubscriptionStatus.ACTIVE;
            case 'past_due':
                return client_1.SubscriptionStatus.PAST_DUE;
            case 'canceled':
            case 'unpaid':
                return client_1.SubscriptionStatus.CANCELLED;
            case 'incomplete':
            case 'incomplete_expired':
            case 'paused':
            default:
                return client_1.SubscriptionStatus.PENDING;
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
            logger_js_1.logger.info({ userId: user.id, email: params.email }, 'Created new student user record from verified payment');
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
                renewedAt: params.status === client_1.SubscriptionStatus.ACTIVE && previousStatus !== client_1.SubscriptionStatus.ACTIVE ? new Date() : null,
            },
            update: {
                plan: params.plan,
                status: params.status,
                expiresAt: params.expiresAt,
                cancelledAt: params.cancelledAt,
                renewedAt: params.status === client_1.SubscriptionStatus.ACTIVE && previousStatus !== client_1.SubscriptionStatus.ACTIVE ? new Date() : undefined,
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
        logger_js_1.logger.info({ userId: user.id, providerRef: params.providerRef, from: previousStatus, to: params.status }, 'Updated student subscription state');
        return { userId: user.id, status: params.status };
    }
    /**
     * Sweeps expired subscriptions where expiresAt has passed.
     * Critical guarantee: Never deletes lesson_progress, quiz_attempts, XP events, streaks, or achievements!
     */
    async sweepExpiredSubscriptions() {
        const now = new Date();
        const expiredUsers = await this.db.user.findMany({
            where: {
                subscriptionStatus: client_1.SubscriptionStatus.ACTIVE,
                subscriptionExpiresAt: {
                    not: null,
                    lte: now,
                },
            },
        });
        const expiredUserIds = [];
        for (const user of expiredUsers) {
            await this.db.user.update({
                where: { id: user.id },
                data: { subscriptionStatus: client_1.SubscriptionStatus.EXPIRED },
            });
            await this.db.subscription.updateMany({
                where: { userId: user.id, status: client_1.SubscriptionStatus.ACTIVE },
                data: { status: client_1.SubscriptionStatus.EXPIRED },
            });
            await this.auditor.log({
                actorType: 'SYSTEM',
                actorId: 'EXPIRY_SWEEP_JOB',
                action: 'SUBSCRIPTION_EXPIRED',
                targetType: 'USER',
                targetId: user.id,
                reason: `Subscription expiration timestamp (${user.subscriptionExpiresAt?.toISOString()}) elapsed. Progress rows preserved.`,
                before: { status: client_1.SubscriptionStatus.ACTIVE },
                after: { status: client_1.SubscriptionStatus.EXPIRED },
            });
            expiredUserIds.push(user.id);
        }
        if (expiredUserIds.length > 0) {
            logger_js_1.logger.info({ count: expiredUserIds.length }, 'Expired subscriptions swept. Student progress preserved.');
        }
        return expiredUserIds;
    }
    /**
     * Finds users whose subscriptions expire within a given window (e.g. 7 days, 3 days, 24 hours)
     * for throttled notifications.
     */
    async findExpiringUsers(withinHours) {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
        const users = await this.db.user.findMany({
            where: {
                subscriptionStatus: client_1.SubscriptionStatus.ACTIVE,
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
            },
        });
        return users.map(u => ({
            id: u.id,
            discordId: u.discordId,
            email: u.email,
            expiresAt: u.subscriptionExpiresAt,
        }));
    }
}
exports.SubscriptionService = SubscriptionService;
exports.subscriptionService = new SubscriptionService();
//# sourceMappingURL=subscription.service.js.map