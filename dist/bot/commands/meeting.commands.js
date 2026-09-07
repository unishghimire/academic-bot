"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meetingCommand = void 0;
const discord_js_1 = require("discord.js");
const meeting_service_js_1 = require("../../services/meeting.service.js");
const permissions_js_1 = require("../middleware/permissions.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
const logger_js_1 = require("../../utils/logger.js");
const interaction_utils_js_1 = require("../../utils/interaction.utils.js");
exports.meetingCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('meeting')
        .setDescription('Schedule, list, or book live meetings and consultations')
        .addSubcommand(sub => sub
        .setName('schedule')
        .setDescription('Schedule a new live class or subscriber meeting (Staff only)')
        .addStringOption(opt => opt.setName('title').setDescription('Meeting title (e.g. Weekly Strategy Call)').setRequired(true))
        .addStringOption(opt => opt.setName('topic').setDescription('Agenda or topics covered').setRequired(true))
        .addStringOption(opt => opt
        .setName('datetime')
        .setDescription('Date & Time (e.g. 2026-09-15 18:00 UTC or YYYY-MM-DD HH:mm)')
        .setRequired(true))
        .addStringOption(opt => opt
        .setName('meeting_url')
        .setDescription('Meeting link (Google Meet, Zoom, or Discord Voice/Stage)')
        .setRequired(true))
        .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Role to ping for this meeting (e.g. @Tier-1, @Tier-2, @Premium)')
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
            const isAllowed = await (0, permissions_js_1.requireInstructor)(interaction);
            if (!isAllowed)
                return;
            if (!(await (0, interaction_utils_js_1.safeDeferReply)(interaction, true)))
                return;
            const title = interaction.options.getString('title', true);
            const topic = interaction.options.getString('topic', true);
            const dateStr = interaction.options.getString('datetime', true);
            const meetingUrl = interaction.options.getString('meeting_url', true);
            const reminderRole = interaction.options.getRole('role');
            // Parse date
            const scheduledDate = new Date(dateStr);
            if (isNaN(scheduledDate.getTime())) {
                await interaction.editReply({
                    embeds: [
                        (0, embed_builder_js_1.createWarningEmbed)('Invalid Date Format', `Could not parse \`${dateStr}\` as a valid date.\n\nPlease use: \`YYYY-MM-DD HH:mm\` (e.g. \`2026-09-15 18:00 UTC\`) or an ISO timestamp.`),
                    ],
                });
                return;
            }
            try {
                const meeting = await meeting_service_js_1.meetingService.scheduleMeeting({
                    title,
                    topic,
                    scheduledAt: scheduledDate,
                    channelUrl: meetingUrl,
                    reminderRole: reminderRole ? reminderRole.id : null,
                });
                const unixTimestamp = Math.floor(scheduledDate.getTime() / 1000);
                const roleMention = reminderRole ? `<@&${reminderRole.id}>` : null;
                // Try to announce in #live-classes or #announcements or current channel
                const guild = interaction.guild;
                if (guild) {
                    const channels = await guild.channels.fetch();
                    const targetChannel = channels.find(c => c && (c.name === 'live-classes' || c.name === 'announcements') && c.isTextBased());
                    const announcementEmbed = (0, embed_builder_js_1.createInfoEmbed)(`📅 New Meeting Scheduled: ${title}`, `**Topic:** ${topic}\n\n` +
                        `🕒 **When:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
                        `🔗 **Join Link:** [Click Here to Join Meeting](${meetingUrl})\n` +
                        (roleMention ? `👥 **Audience:** ${roleMention}\n` : '') +
                        `\n*Meeting ID:* \`${meeting.id}\``);
                    if (targetChannel) {
                        await targetChannel.send({
                            content: roleMention ? `📢 ${roleMention} — New meeting scheduled!` : undefined,
                            embeds: [announcementEmbed],
                        }).catch(err => logger_js_1.logger.warn({ err }, 'Could not post to live-classes channel'));
                    }
                }
                await interaction.editReply({
                    embeds: [
                        (0, embed_builder_js_1.createSuccessEmbed)('Meeting Scheduled! 📅', `Successfully scheduled **${title}**!\n\n` +
                            `• **ID:** \`${meeting.id}\`\n` +
                            `• **Date & Time:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
                            `• **Link:** ${meetingUrl}\n` +
                            (reminderRole ? `• **Notified Role:** <@&${reminderRole.id}>\n` : '') +
                            `\nStudents can also view this anytime using \`/meeting list\`.`),
                    ],
                });
            }
            catch (err) {
                logger_js_1.logger.error({ err }, 'Failed to schedule meeting');
                await interaction.editReply({
                    embeds: [(0, embed_builder_js_1.createErrorEmbed)('Failed to Schedule Meeting', err.message || 'An unexpected error occurred.')],
                });
            }
        }
        else if (sub === 'list') {
            if (!(await (0, interaction_utils_js_1.safeDeferReply)(interaction, true)))
                return;
            try {
                const meetings = await meeting_service_js_1.meetingService.listUpcomingMeetings();
                if (!meetings || meetings.length === 0) {
                    await interaction.editReply({
                        embeds: [
                            (0, embed_builder_js_1.createInfoEmbed)('📅 Upcoming Meetings', 'There are currently no upcoming meetings or live classes scheduled.\n\nCheck back soon or ask an instructor in the support channel!'),
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
                const embed = (0, embed_builder_js_1.createInfoEmbed)('📅 Upcoming Meetings & Live Sessions', listContent + '\n*Run `/meeting book` if you wish to book a 1-on-1 consultation.*');
                await interaction.editReply({ embeds: [embed] });
            }
            catch (err) {
                await interaction.editReply({
                    embeds: [(0, embed_builder_js_1.createErrorEmbed)('Error', err.message || 'Could not fetch meetings.')],
                });
            }
        }
        else if (sub === 'cancel') {
            const isAllowed = await (0, permissions_js_1.requireInstructor)(interaction);
            if (!isAllowed)
                return;
            if (!(await (0, interaction_utils_js_1.safeDeferReply)(interaction, true)))
                return;
            const meetingId = interaction.options.getString('meeting_id', true);
            const success = await meeting_service_js_1.meetingService.cancelMeeting(meetingId);
            if (success) {
                await interaction.editReply({
                    embeds: [(0, embed_builder_js_1.createSuccessEmbed)('Meeting Cancelled', `Meeting with ID \`${meetingId}\` has been removed.`)],
                });
            }
            else {
                await interaction.editReply({
                    embeds: [(0, embed_builder_js_1.createWarningEmbed)('Meeting Not Found', `No scheduled meeting found with ID \`${meetingId}\`.`)],
                });
            }
        }
        else if (sub === 'book') {
            if (!(await (0, interaction_utils_js_1.safeDeferReply)(interaction, true)))
                return;
            const embed = (0, embed_builder_js_1.createInfoEmbed)('🤝 1-on-1 Meeting & Consultation Booking', 'As an active subscriber, you have direct access to our instructors for personalized reviews and strategy sessions.\n\n' +
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