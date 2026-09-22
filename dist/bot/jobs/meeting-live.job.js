import cron from 'node-cron';
import { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, } from 'discord.js';
import { meetingService } from '../../services/meeting.service.js';
import { env } from '../../config/env.js';
import { COLORS, EMBED_FOOTER } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { resolveAnnouncementChannel } from '../../utils/channel.utils.js';
import { resolveEliteRole } from '../../utils/role.utils.js';
/**
 * Checks for scheduled meetings that have reached their scheduled start time,
 * creates their dedicated voice channel in the designated category,
 * and broadcasts the live announcement with direct join link.
 */
export async function runMeetingLiveCheck(client) {
    if (!client.isReady())
        return;
    try {
        const guild = client.guilds.cache.get(env.DISCORD_GUILD_ID);
        if (!guild)
            return;
        const dueMeetings = await meetingService.getDueUnannouncedMeetings();
        if (!dueMeetings || dueMeetings.length === 0)
            return;
        for (const meeting of dueMeetings) {
            try {
                logger.info({ meetingId: meeting.id, title: meeting.title }, '⏰ Scheduled meeting start time reached! Provisioning live voice room and broadcasting announcement...');
                // 1. Create the dedicated Discord Voice Channel
                let voiceChannel = null;
                try {
                    voiceChannel = await guild.channels.create({
                        name: `🔊 │ ${meeting.title.substring(0, 90)}`,
                        type: ChannelType.GuildVoice,
                        parent: meeting.categoryId || undefined,
                        reason: `Automated live class voice room for meeting "${meeting.title}" (${meeting.id})`,
                    });
                    logger.info({ voiceChannelId: voiceChannel.id }, 'Created live voice channel for meeting');
                }
                catch (err) {
                    logger.error({ err: err?.message, meetingId: meeting.id }, 'Failed to create voice channel for live meeting');
                }
                const voiceUrl = voiceChannel
                    ? `https://discord.com/channels/${guild.id}/${voiceChannel.id}`
                    : (meeting.channelUrl && !meeting.channelUrl.startsWith('🔊') ? meeting.channelUrl : null);
                // 2. Determine target channel for live announcement
                const announcementChannel = await resolveAnnouncementChannel(guild, meeting.targetChannelId);
                // 3. Resolve role mention (defaults to @Elite)
                let roleMention = meeting.reminderRole ? `<@&${meeting.reminderRole}>` : null;
                if (!roleMention) {
                    const eliteRole = resolveEliteRole(guild);
                    if (eliteRole)
                        roleMention = `<@&${eliteRole.id}>`;
                }
                // 4. Send Live Broadcast Announcement
                if (announcementChannel) {
                    const liveEmbed = new EmbedBuilder()
                        .setTitle(`🔴 LIVE NOW: ${meeting.title}`)
                        .setColor(COLORS.DANGER)
                        .setDescription(`The scheduled live class is **now open and starting**!\n\n` +
                        `• **Topic:** ${meeting.topic}\n` +
                        (voiceChannel ? `• **Voice Room:** <#${voiceChannel.id}>\n` : '') +
                        (voiceUrl ? `• **Direct Link:** [Click to Join Voice Room](${voiceUrl})\n\n` : '\n') +
                        `👉 Hop into the voice channel now to join the live training session!`)
                        .setFooter(EMBED_FOOTER)
                        .setTimestamp();
                    const components = [];
                    if (voiceUrl) {
                        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
                            .setLabel('🔊 Join Live Class')
                            .setStyle(ButtonStyle.Link)
                            .setURL(voiceUrl)));
                    }
                    await announcementChannel.send({
                        content: roleMention ? `🔴 ${roleMention} — Class is NOW LIVE!` : '🔴 **Live Class Started!**',
                        embeds: [liveEmbed],
                        components,
                    }).catch(err => logger.warn({ err: err?.message }, 'Failed to send live announcement'));
                }
                // 5. Mark meeting as live in store
                await meetingService.markMeetingLive(meeting.id, voiceChannel?.id, voiceUrl || undefined);
                logger.info({ meetingId: meeting.id }, 'Meeting marked live successfully');
            }
            catch (err) {
                logger.error({ err: err?.message, meetingId: meeting.id }, 'Error during meeting live broadcast processing');
            }
        }
    }
    catch (err) {
        logger.error({ err: err?.message }, 'Error in runMeetingLiveCheck');
    }
}
/**
 * Initializes the 1-minute live meeting cron job
 */
export function initMeetingLiveJob(client) {
    logger.info('Initializing automated Meeting Live Room & Broadcast worker (every 1 minute)...');
    // Run on startup after 10s
    setTimeout(() => {
        runMeetingLiveCheck(client).catch(err => {
            logger.error({ err }, 'Initial meeting live check failed');
        });
    }, 10000);
    // Recurring check every minute
    cron.schedule('* * * * *', () => {
        runMeetingLiveCheck(client).catch(err => {
            logger.error({ err }, 'Scheduled meeting live check failed');
        });
    });
}
//# sourceMappingURL=meeting-live.job.js.map