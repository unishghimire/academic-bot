import { SlashCommandBuilder, ChannelType, } from 'discord.js';
import { meetingService } from '../../services/meeting.service.js';
import { requireInstructor } from '../middleware/permissions.js';
import { createSuccessEmbed, createInfoEmbed, createWarningEmbed, createErrorEmbed } from '../../utils/embed-builder.js';
import { logger } from '../../utils/logger.js';
import { safeDeferReply } from '../../utils/interaction.utils.js';
import { env } from '../../config/env.js';
export const meetingCommand = {
    data: new SlashCommandBuilder()
        .setName('meeting')
        .setDescription('Schedule, list, or book live meetings and consultations')
        .addSubcommand(sub => sub
        .setName('schedule')
        .setDescription('Schedule a new live class or subscriber meeting (Staff only)')
        .addStringOption(opt => opt.setName('title').setDescription('Meeting title (e.g. Weekly Strategy Call)').setRequired(true))
        .addStringOption(opt => opt
        .setName('datetime')
        .setDescription('Date & Time (e.g. 2026-09-15 18:00 UTC or YYYY-MM-DD HH:mm)')
        .setRequired(true))
        .addChannelOption(opt => opt
        .setName('category')
        .setDescription('Category where voice channel will be auto-created')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true))
        .addStringOption(opt => opt.setName('topic').setDescription('Agenda or topics covered (optional)').setRequired(false))
        .addStringOption(opt => opt
        .setName('meeting_url')
        .setDescription('Custom link if using external Zoom/Meet (optional)')
        .setRequired(false))
        .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to ping for this meeting (defaults to @Elite)')
        .setRequired(false)))
        .addSubcommand(sub => sub
        .setName('list')
        .setDescription('View all upcoming scheduled meetings and live classes'))
        .addSubcommand(sub => sub
        .setName('cancel')
        .setDescription('Cancel a scheduled meeting (Staff only)')
        .addStringOption(opt => opt.setName('meeting_id').setDescription('Meeting ID to cancel').setRequired(true)))
        .addSubcommand(sub => sub
        .setName('book')
        .setDescription('View instructions or links to book a 1-on-1 consultation')),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'schedule') {
            const isAllowed = await requireInstructor(interaction);
            if (!isAllowed)
                return;
            if (!(await safeDeferReply(interaction, true)))
                return;
            const title = interaction.options.getString('title', true);
            const dateStr = interaction.options.getString('datetime', true);
            const category = interaction.options.getChannel('category', true);
            const topic = interaction.options.getString('topic') || title;
            const meetingUrl = interaction.options.getString('meeting_url') || '🔊 Auto-Created Voice Channel';
            let reminderRole = interaction.options.getRole('role');
            // Default ping role to Elite role if not specified
            if (!reminderRole && interaction.guild) {
                reminderRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'elite' || r.id === env.ROLE_ELITE) || null;
            }
            // Parse date
            const scheduledDate = new Date(dateStr);
            if (isNaN(scheduledDate.getTime())) {
                await interaction.editReply({
                    embeds: [
                        createWarningEmbed('Invalid Date Format', `Could not parse \`${dateStr}\` as a valid date.\n\nPlease use: \`YYYY-MM-DD HH:mm\` (e.g. \`2026-09-15 18:00 UTC\`) or an ISO timestamp.`),
                    ],
                });
                return;
            }
            try {
                const meeting = await meetingService.scheduleMeeting({
                    title,
                    topic,
                    scheduledAt: scheduledDate,
                    channelUrl: meetingUrl,
                    reminderRole: reminderRole ? reminderRole.id : null,
                    categoryId: category.id,
                    categoryName: category.name,
                    targetChannelId: interaction.channelId,
                });
                const unixTimestamp = Math.floor(scheduledDate.getTime() / 1000);
                const roleMention = reminderRole ? `<@&${reminderRole.id}>` : null;
                // Try to announce in #welcome or current channel
                const guild = interaction.guild;
                if (guild) {
                    const channels = await guild.channels.fetch();
                    const targetChannel = (channels.find(c => c && (c.name.toLowerCase() === 'welcome' || c.id === env.CHANNEL_WELCOME) && c.isTextBased()) || interaction.channel);
                    const announcementEmbed = createInfoEmbed(`📅 New Meeting Scheduled: ${title}`, `**Topic:** ${topic}\n\n` +
                        `🕒 **When:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
                        `🔊 **Voice Channel:** Auto-opens in category **${category.name}** when live\n` +
                        (meetingUrl !== '🔊 Auto-Created Voice Channel' ? `🔗 **Direct Link:** [Join Meeting](${meetingUrl})\n` : '') +
                        (roleMention ? `👥 **Audience:** ${roleMention}\n` : '') +
                        `\n*Meeting ID:* \`${meeting.id}\``);
                    if (targetChannel && targetChannel.isTextBased()) {
                        await targetChannel.send({
                            content: roleMention ? `📢 ${roleMention} — New class/meeting scheduled!` : undefined,
                            embeds: [announcementEmbed],
                        }).catch(err => logger.warn({ err }, 'Could not post meeting announcement'));
                    }
                }
                await interaction.editReply({
                    embeds: [
                        createSuccessEmbed('Meeting Scheduled! 📅', `Successfully scheduled **${title}**!\n\n` +
                            `• **ID:** \`${meeting.id}\`\n` +
                            `• **Date & Time:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
                            `• **Voice Channel Category:** ${category.name}\n` +
                            (reminderRole ? `• **Notified Role:** <@&${reminderRole.id}>\n` : '') +
                            `\n⚡ *When the scheduled time arrives, the bot will automatically create the voice channel in "${category.name}" and broadcast the live link!*`),
                    ],
                });
            }
            catch (err) {
                logger.error({ err }, 'Failed to schedule meeting');
                await interaction.editReply({
                    embeds: [createErrorEmbed('Failed to Schedule Meeting', err.message || 'An unexpected error occurred.')],
                });
            }
        }
        else if (sub === 'list') {
            if (!(await safeDeferReply(interaction, true)))
                return;
            try {
                const meetings = await meetingService.listUpcomingMeetings();
                if (!meetings || meetings.length === 0) {
                    await interaction.editReply({
                        embeds: [
                            createInfoEmbed('📅 Upcoming Meetings', 'There are currently no upcoming meetings or live classes scheduled.\n\nCheck back soon or ask an instructor in the support channel!'),
                        ],
                    });
                    return;
                }
                const listContent = meetings
                    .map((m, index) => {
                    const unix = Math.floor(new Date(m.scheduledAt).getTime() / 1000);
                    return (`**${index + 1}. ${m.title}**\n` +
                        `• **Topic:** ${m.topic}\n` +
                        `• **When:** <t:${unix}:F> (<t:${unix}:R>)\n` +
                        `• **Link:** [Join Meeting](${m.channelUrl})\n` +
                        (m.reminderRole ? `• **For:** <@&${m.reminderRole}>\n` : '') +
                        `• *ID:* \`${m.id}\`\n`);
                })
                    .join('\n');
                const embed = createInfoEmbed('📅 Upcoming Meetings & Live Sessions', listContent + '\n*Run `/meeting book` if you wish to book a 1-on-1 consultation.*');
                await interaction.editReply({ embeds: [embed] });
            }
            catch (err) {
                await interaction.editReply({
                    embeds: [createErrorEmbed('Error', err.message || 'Could not fetch meetings.')],
                });
            }
        }
        else if (sub === 'cancel') {
            const isAllowed = await requireInstructor(interaction);
            if (!isAllowed)
                return;
            if (!(await safeDeferReply(interaction, true)))
                return;
            const meetingId = interaction.options.getString('meeting_id', true);
            const success = await meetingService.cancelMeeting(meetingId);
            if (success) {
                await interaction.editReply({
                    embeds: [createSuccessEmbed('Meeting Cancelled', `Meeting with ID \`${meetingId}\` has been removed.`)],
                });
            }
            else {
                await interaction.editReply({
                    embeds: [createWarningEmbed('Meeting Not Found', `No scheduled meeting found with ID \`${meetingId}\`.`)],
                });
            }
        }
        else if (sub === 'book') {
            if (!(await safeDeferReply(interaction, true)))
                return;
            const embed = createInfoEmbed('🤝 1-on-1 Meeting & Consultation Booking', 'As an active subscriber, you have direct access to our instructors for personalized reviews and strategy sessions.\n\n' +
                '**How to Book a 1-on-1:**\n' +
                '1. Check upcoming open slots or reach out to an instructor in the server.\n' +
                '2. Prepare your questions, campaign drafts, or video scripts in advance.\n' +
                '3. For immediate assistance, feel free to drop a message in `#support` or DM an instructor.\n\n' +
                '👉 Check group live sessions anytime with: `/meeting list`');
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
//# sourceMappingURL=meeting.commands.js.map