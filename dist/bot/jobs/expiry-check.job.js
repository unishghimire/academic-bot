import cron from 'node-cron';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, } from 'discord.js';
import { subscriptionService } from '../../services/subscription.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { COLORS, EMBED_FOOTER } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { localStore } from '../../db/local-store.js';
import { logger } from '../../utils/logger.js';
/**
 * Runs the subscription expiry sweep and 3-day renewal warning checks
 */
export async function runExpirySweep(client) {
    if (!client.isReady())
        return;
    try {
        const portalUrl = env.STUDENT_PORTAL_URL || 'https://academic-student-portal.vercel.app';
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        // 1. Sweep expired subscriptions across PostgreSQL, Supabase, and localStore
        const expiredUsers = await subscriptionService.sweepExpiredSubscriptionsDetailed();
        for (const u of expiredUsers) {
            // Reconcile and strip Discord roles directly
            await roleSyncService.syncUserRoles(u.id, client).catch(() => { });
            if (u.discordId && guild) {
                // Direct safety role revocation
                try {
                    const member = await guild.members.fetch(u.discordId).catch(() => null);
                    if (member) {
                        const managedRoles = [
                            env.ROLE_PREMIUM,
                            env.ROLE_TIER_1,
                            env.ROLE_TIER_2,
                            env.ROLE_TIER_3,
                            env.ROLE_GRADUATE,
                        ].filter(Boolean);
                        const rolesToRemove = managedRoles.filter(r => member.roles.cache.has(r));
                        if (rolesToRemove.length > 0) {
                            await member.roles.remove(rolesToRemove).catch(() => { });
                        }
                    }
                }
                catch {
                    // Ignore member fetch errors
                }
                // Send Expiration DM with payment portal link (deduplicated per expiry cycle)
                if (!localStore.hasExpiredNoticeBeenSent(u.id, u.expiresAt)) {
                    try {
                        const discordUser = await client.users.fetch(u.discordId).catch(() => null);
                        if (discordUser) {
                            const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                                .setLabel('💳 Reactivate Membership')
                                .setStyle(ButtonStyle.Link)
                                .setURL(portalUrl));
                            const embed = new EmbedBuilder()
                                .setTitle('⚠️ Course Subscription Expired')
                                .setColor(COLORS.DANGER)
                                .setDescription(`Hello <@${u.discordId}>,\n\n` +
                                `Your course subscription has **expired** and your subscriber roles have been removed from the server.\n\n` +
                                `• **Previous Access:** Tier ${u.tier}\n` +
                                `• **Expired On:** <t:${Math.floor(new Date(u.expiresAt).getTime() / 1000)}:F>\n\n` +
                                `⭐ **Your Progress is Safe:** All your completed lessons, quiz scores, XP, and achievements remain **permanently preserved**.\n\n` +
                                `👉 Click the button below to visit the payment portal and reactivate your membership to restore your roles and access!`)
                                .setFooter(EMBED_FOOTER)
                                .setTimestamp();
                            await discordUser.send({ embeds: [embed], components: [row] }).catch(() => { });
                            localStore.markExpiredNoticeSent(u.id, u.expiresAt);
                            logger.info({ userId: u.id, discordId: u.discordId }, 'Delivered subscription expired DM with portal reactivation link');
                        }
                    }
                    catch {
                        // Ignore DM failure if user has closed DMs
                    }
                }
            }
        }
        // 2. Advance renewal notice if expiration is less than 3 days (<= 72 hours)
        const expiringUsers = await subscriptionService.findExpiringUsers(72);
        for (const u of expiringUsers) {
            if (!u.discordId)
                continue;
            // Ensure user only receives one warning for their current subscription expiration date
            if (localStore.hasWarningBeenSent(u.id, u.expiresAt)) {
                continue;
            }
            try {
                const discordUser = await client.users.fetch(u.discordId).catch(() => null);
                if (discordUser) {
                    const daysLeft = Math.max(1, Math.ceil(u.hoursRemaining / 24));
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setLabel('💳 Renew Subscription Now')
                        .setStyle(ButtonStyle.Link)
                        .setURL(portalUrl));
                    const embed = new EmbedBuilder()
                        .setTitle('⏳ Academy Course Subscription Expiring Soon!')
                        .setColor(COLORS.WARNING || 0xF59E0B)
                        .setDescription(`Hello <@${u.discordId}>,\n\n` +
                        `Your Academy course subscription is **about to expire in ${daysLeft} day(s)** on <t:${Math.floor(new Date(u.expiresAt).getTime() / 1000)}:F> (<t:${Math.floor(new Date(u.expiresAt).getTime() / 1000)}:R>)!\n\n` +
                        `• **Current Access:** **Tier ${u.tier}** + Premium Subscriber\n\n` +
                        `Renew now to keep your private tier channel access, scheduled live classes, and course materials without interruption.\n\n` +
                        `*Note: Your completed lessons, XP, streak, and tier progress will remain permanently preserved even if your subscription expires.*`)
                        .setFooter(EMBED_FOOTER)
                        .setTimestamp();
                    await discordUser.send({ embeds: [embed], components: [row] }).catch(() => { });
                    localStore.markWarningSent(u.id, u.expiresAt);
                    logger.info({ userId: u.id, discordId: u.discordId, daysLeft }, 'Delivered 3-day advance subscription expiration reminder DM');
                }
            }
            catch {
                // Ignore DM failure if user has closed DMs
            }
        }
    }
    catch (error) {
        logger.error({ error }, 'Error during subscription expiry check and sweep');
        await errorLogger.report(client, {
            module: 'EXPIRY_JOB',
            action: '3_MINUTE_SWEEP',
            error,
        });
    }
}
/**
 * Initializes the automated 3-minute recurring subscription expiry check worker
 */
export function initExpiryCheckJob(client) {
    logger.info('Initializing automated Subscription Expiry Check worker (every 3 minutes)...');
    // Trigger an initial sweep shortly after startup
    setTimeout(() => {
        runExpirySweep(client).catch(err => {
            logger.warn({ err }, 'Initial subscription expiry sweep encountered an issue');
        });
    }, 5000);
    // Run every 3 minutes
    const task = cron.schedule('*/3 * * * *', async () => {
        logger.info('Starting scheduled 3-minute subscription expiry check...');
        await runExpirySweep(client);
        logger.info('Completed 3-minute subscription expiry check.');
    });
    return task;
}
//# sourceMappingURL=expiry-check.job.js.map