"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStripeRouter = createStripeRouter;
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const env_js_1 = require("../../config/env.js");
const subscription_service_js_1 = require("../../services/subscription.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
const logger_js_1 = require("../../utils/logger.js");
function createStripeRouter(discordClient) {
    const router = (0, express_1.Router)();
    const stripe = env_js_1.env.STRIPE_SECRET_KEY ? new stripe_1.default(env_js_1.env.STRIPE_SECRET_KEY) : null;
    router.post('/stripe', async (req, res) => {
        if (!stripe || !env_js_1.env.STRIPE_WEBHOOK_SECRET) {
            res.status(200).send('Stripe integration not configured. Manual payments are active.');
            return;
        }
        const sig = req.headers['stripe-signature'];
        let event;
        try {
            if (env_js_1.env.NODE_ENV === 'test' && (!sig || sig === 'mock_sig')) {
                // Allow mock testing
                event = req.body;
            }
            else {
                if (!sig) {
                    res.status(400).send('Webhook Error: Missing stripe-signature');
                    return;
                }
                event = stripe.webhooks.constructEvent(req.body, sig, env_js_1.env.STRIPE_WEBHOOK_SECRET);
            }
        }
        catch (err) {
            logger_js_1.logger.error({ err }, 'Stripe webhook signature verification failed');
            await error_logger_service_js_1.errorLogger.report(discordClient ?? null, {
                module: 'STRIPE_WEBHOOK',
                action: 'SIGNATURE_VERIFICATION',
                error: err,
            });
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        try {
            logger_js_1.logger.info({ eventType: event.type, eventId: event.id }, 'Received Stripe webhook');
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted': {
                    const subscription = event.data.object;
                    const customerId = subscription.customer;
                    // Retrieve customer email if needed
                    let email = '';
                    if (typeof subscription.customer === 'object' && subscription.customer !== null) {
                        email = subscription.customer.email || '';
                    }
                    else {
                        const customer = await stripe.customers.retrieve(customerId).catch(() => null);
                        if (customer && !customer.deleted) {
                            email = customer.email || '';
                        }
                    }
                    if (!email) {
                        logger_js_1.logger.warn({ customerId }, 'Unable to resolve customer email for subscription');
                        res.status(200).json({ received: true, note: 'Email unresolved' });
                        return;
                    }
                    const status = subscription_service_js_1.subscriptionService.mapStripeStatus(subscription.status);
                    const expiresAt = subscription.current_period_end
                        ? new Date(subscription.current_period_end * 1000)
                        : null;
                    const startedAt = new Date(subscription.start_date * 1000);
                    const cancelledAt = subscription.canceled_at
                        ? new Date(subscription.canceled_at * 1000)
                        : null;
                    const result = await subscription_service_js_1.subscriptionService.handleSubscriptionUpdated({
                        providerRef: subscription.id,
                        email,
                        plan: subscription.items.data[0]?.price.id || 'premium_monthly',
                        status,
                        startedAt,
                        expiresAt,
                        cancelledAt,
                    });
                    // Trigger immediate role sync if Discord client is active
                    if (discordClient) {
                        await role_sync_service_js_1.roleSyncService.syncUserRoles(result.userId, discordClient).catch(err => {
                            logger_js_1.logger.error({ err, userId: result.userId }, 'Error triggering immediate role sync after payment');
                        });
                    }
                    break;
                }
                case 'invoice.payment_succeeded': {
                    const invoice = event.data.object;
                    logger_js_1.logger.info({ invoiceId: invoice.id, customer: invoice.customer }, 'Invoice payment succeeded');
                    break;
                }
                case 'invoice.payment_failed': {
                    const invoice = event.data.object;
                    logger_js_1.logger.warn({ invoiceId: invoice.id, customer: invoice.customer }, 'Invoice payment failed');
                    break;
                }
                default:
                    logger_js_1.logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
            }
            res.status(200).json({ received: true });
        }
        catch (err) {
            await error_logger_service_js_1.errorLogger.report(discordClient ?? null, {
                module: 'STRIPE_WEBHOOK',
                action: 'EVENT_PROCESSING',
                error: err,
                metadata: { eventId: event.id, eventType: event.type },
            });
            res.status(500).json({ error: 'Internal server error processing webhook' });
        }
    });
    return router;
}
//# sourceMappingURL=stripe.routes.js.map