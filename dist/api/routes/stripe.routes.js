import { Router } from 'express';
import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { subscriptionService } from '../../services/subscription.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { logger } from '../../utils/logger.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { prisma } from '../../db/client.js';
import { COLORS, EMBED_FOOTER } from '../../config/constants.js';
import { SubscriptionStatus } from '@prisma/client';
export function createStripeRouter(discordClient) {
    const router = Router();
    const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
    router.post('/stripe', async (req, res) => {
        if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
            res.status(200).send('Stripe integration not configured. Manual payments are active.');
            return;
        }
        const sig = req.headers['stripe-signature'];
        let event;
        try {
            if (env.NODE_ENV === 'test' && (!sig || sig === 'mock_sig')) {
                // Allow mock testing
                event = req.body;
            }
            else {
                if (!sig) {
                    res.status(400).send('Webhook Error: Missing stripe-signature');
                    return;
                }
                event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
            }
        }
        catch (err) {
            logger.error({ err }, 'Stripe webhook signature verification failed');
            await errorLogger.report(discordClient ?? null, {
                module: 'STRIPE_WEBHOOK',
                action: 'SIGNATURE_VERIFICATION',
                error: err,
            });
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        try {
            logger.info({ eventType: event.type, eventId: event.id }, 'Received Stripe webhook');
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
                        logger.warn({ customerId }, 'Unable to resolve customer email for subscription');
                        res.status(200).json({ received: true, note: 'Email unresolved' });
                        return;
                    }
                    const status = subscriptionService.mapStripeStatus(subscription.status);
                    const expiresAt = subscription.current_period_end
                        ? new Date(subscription.current_period_end * 1000)
                        : null;
                    const startedAt = new Date(subscription.start_date * 1000);
                    const cancelledAt = subscription.canceled_at
                        ? new Date(subscription.canceled_at * 1000)
                        : null;
                    const result = await subscriptionService.handleSubscriptionUpdated({
                        providerRef: subscription.id,
                        email,
                        plan: subscription.items.data[0]?.price.id || 'premium_monthly',
                        status,
                        startedAt,
                        expiresAt,
                        cancelledAt,
                    });
                    // Trigger immediate role sync and welcome DM if Discord client is active
                    if (discordClient) {
                        await roleSyncService.syncUserRoles(result.userId, discordClient).catch(err => {
                            logger.error({ err, userId: result.userId }, 'Error triggering immediate role sync after payment');
                        });
                        if (result.status === SubscriptionStatus.ACTIVE) {
                            try {
                                const user = await prisma.user.findUnique({ where: { id: result.userId } }).catch(() => null);
                                if (user?.discordId) {
                                    const discordUser = await discordClient.users.fetch(user.discordId).catch(() => null);
                                    if (discordUser) {
                                        const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
                                        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                                            .setLabel('⚡ Open Student Portal')
                                            .setStyle(ButtonStyle.Link)
                                            .setURL(portalUrl));
                                        const embed = new EmbedBuilder()
                                            .setTitle('🎉 Payment Verified & Access Activated!')
                                            .setColor(COLORS.SUCCESS)
                                            .setDescription(`Welcome to **The Elite Circle Academy**!\n\n` +
                                            `Your subscription payment has been verified and processed successfully.\n\n` +
                                            `• **Status:** Active Subscription\n` +
                                            `• **Expires:** ${expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : '*Active Subscription*'}\n\n` +
                                            `Your Discord subscriber roles have been synchronized automatically. Use \`/subscription\` to view your membership details!`)
                                            .setFooter(EMBED_FOOTER)
                                            .setTimestamp();
                                        await discordUser.send({ embeds: [embed], components: [row] }).catch(() => { });
                                    }
                                }
                            }
                            catch {
                                // Ignore DM failure
                            }
                        }
                    }
                    break;
                }
                case 'invoice.payment_succeeded': {
                    const invoice = event.data.object;
                    logger.info({ invoiceId: invoice.id, customer: invoice.customer }, 'Invoice payment succeeded');
                    break;
                }
                case 'invoice.payment_failed': {
                    const invoice = event.data.object;
                    logger.warn({ invoiceId: invoice.id, customer: invoice.customer }, 'Invoice payment failed');
                    break;
                }
                default:
                    logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
            }
            res.status(200).json({ received: true });
        }
        catch (err) {
            await errorLogger.report(discordClient ?? null, {
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