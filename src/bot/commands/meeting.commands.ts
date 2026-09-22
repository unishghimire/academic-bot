import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  ChannelType,
  CategoryChannel,
} from 'discord.js';
import { meetingService } from '../../services/meeting.service.js';
import { requireInstructor } from '../middleware/permissions.js';
import { createSuccessEmbed, createInfoEmbed, createWarningEmbed, createErrorEmbed } from '../../utils/embed-builder.js';
import { logger } from '../../utils/logger.js';
import { safeDeferReply } from '../../utils/interaction.utils.js';
import { env } from '../../config/env.js';
import { resolveAnnouncementChannel } from '../../utils/channel.utils.js';
import { resolveEliteRole } from '../../utils/role.utils.js';

export const meetingCommand = {
  data: new SlashCommandBuilder()
    .setName('meeting')
    .setDescription('Schedule, list, or book live meetings and consultations')
    .addSubcommand(sub =>
      sub
        .setName('schedule')
        .setDescription('Schedule a new live class or subscriber meeting (Staff only)')
        .addStringOption(opt =>
          opt.setName('title').setDescription('Meeting title (e.g. Weekly Strategy Call)').setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('datetime')
            .setDescription('Date & Time (e.g. 2026-09-15 18:00 UTC or YYYY-MM-DD HH:mm)')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('category')
            .setDescription('Category where voice channel will be auto-created')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt
            .setName('announcement_channel')
            .setDescription('Text channel to post announcement (defaults to #welcome or #announcements)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('topic').setDescription('Agenda or topics covered (optional)').setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('meeting_url')
            .setDescription('Custom link if using external Zoom/Meet (optional)')
            .setRequired(false)
        )
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('Role to ping for this meeting (defaults to @Elite)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View all upcoming scheduled meetings and live classes')
    )
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel a scheduled meeting (Staff only)')
        .addStringOption(opt =>
          opt.setName('meeting_id').setDescription('Meeting ID to cancel').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('book')
        .setDescription('View instructions or links to book a 1-on-1 consultation')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'schedule') {
      const isAllowed = await requireInstructor(interaction);
      if (!isAllowed) return;

      if (!(await safeDeferReply(interaction, true))) return;

      const title = interaction.options.getString('title', true);
      const dateStr = interaction.options.getString('datetime', true);
      const category = interaction.options.getChannel('category', true) as CategoryChannel;
      const customChannel = interaction.options.getChannel('announcement_channel') as TextChannel | null;
      const topic = interaction.options.getString('topic') || title;
      const meetingUrl = interaction.options.getString('meeting_url') || '🔊 Auto-Created Voice Channel';
      let reminderRole = interaction.options.getRole('role');

      // Default ping role to Elite role if not specified
      if (!reminderRole && interaction.guild) {
        reminderRole = resolveEliteRole(interaction.guild);
      }

      // Parse date
      const scheduledDate = new Date(dateStr);
      if (isNaN(scheduledDate.getTime())) {
        await interaction.editReply({
          embeds: [
            createWarningEmbed(
              'Invalid Date Format',
              `Could not parse \`${dateStr}\` as a valid date.\n\nPlease use: \`YYYY-MM-DD HH:mm\` (e.g. \`2026-09-15 18:00 UTC\`) or an ISO timestamp.`
            ),
          ],
        });
        return;
      }

      // Resolve announcement channel (custom channel -> #welcome -> #announcements -> current channel)
      let targetChannel: TextChannel | null = null;
      if (interaction.guild) {
        targetChannel = await resolveAnnouncementChannel(interaction.guild, customChannel?.id);
      }
      if (!targetChannel && interaction.channel && interaction.channel.isTextBased()) {
        targetChannel = interaction.channel as TextChannel;
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
          targetChannelId: targetChannel ? targetChannel.id : interaction.channelId,
        });

        const unixTimestamp = Math.floor(scheduledDate.getTime() / 1000);
        const roleMention = reminderRole ? `<@&${reminderRole.id}>` : null;

        // Post announcement to target channel
        let announcementPosted = false;
        let announcementError: string | null = null;

        if (targetChannel && typeof targetChannel.send === 'function') {
          const announcementEmbed = createInfoEmbed(
            `📅 New Meeting Scheduled: ${title}`,
            `**Topic:** ${topic}\n\n` +
            `🕒 **When:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
            `🔊 **Voice Channel:** Auto-opens in category **${category.name}** when live\n` +
            (meetingUrl !== '🔊 Auto-Created Voice Channel' ? `🔗 **Direct Link:** [Join Meeting](${meetingUrl})\n` : '') +
            (roleMention ? `👥 **Audience:** ${roleMention}\n` : '') +
            `\n*Meeting ID:* \`${meeting.id}\``
          );

          try {
            await targetChannel.send({
              content: roleMention ? `📢 ${roleMention} — New class/meeting scheduled!` : undefined,
              embeds: [announcementEmbed],
            });
            announcementPosted = true;
            logger.info({ channelId: targetChannel.id, title }, 'Meeting announcement posted successfully');
          } catch (postErr: any) {
            announcementError = postErr?.message || 'Permission denied or send failed';
            logger.warn({ err: postErr, channelId: targetChannel.id }, 'Could not post meeting announcement');
          }
        }

        await interaction.editReply({
          embeds: [
            createSuccessEmbed(
              'Meeting Scheduled! 📅',
              `Successfully scheduled **${title}**!\n\n` +
              `• **ID:** \`${meeting.id}\`\n` +
              `• **Date & Time:** <t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)\n` +
              `• **Voice Channel Category:** ${category.name}\n` +
              (announcementPosted && targetChannel
                ? `• **📢 Announced In:** <#${targetChannel.id}>\n`
                : targetChannel
                  ? `• ⚠️ **Announcement Status:** Could not post to <#${targetChannel.id}> (${announcementError})\n`
                  : '') +
              (reminderRole ? `• **Notified Role:** <@&${reminderRole.id}>\n` : '') +
              `\n⚡ *When the scheduled time arrives (<t:${unixTimestamp}:R>), the bot will automatically create the voice channel in "${category.name}" and broadcast the live link!*`
            ),
          ],
        });
      } catch (err: any) {
        logger.error({ err }, 'Failed to schedule meeting');
        await interaction.editReply({
          embeds: [createErrorEmbed('Failed to Schedule Meeting', err.message || 'An unexpected error occurred.')],
        });
      }
    } else if (sub === 'list') {
      if (!(await safeDeferReply(interaction, true))) return;

      try {
        const meetings = await meetingService.listUpcomingMeetings();

        if (!meetings || meetings.length === 0) {
          await interaction.editReply({
            embeds: [
              createInfoEmbed(
                '📅 Upcoming Meetings',
                'There are currently no upcoming meetings or live classes scheduled.\n\nCheck back soon or ask an instructor in the support channel!'
              ),
            ],
          });
          return;
        }

        const listContent = meetings
          .map((m, index) => {
            const unix = Math.floor(new Date(m.scheduledAt).getTime() / 1000);
            return (
              `**${index + 1}. ${m.title}**\n` +
              `• **Topic:** ${m.topic}\n` +
              `• **When:** <t:${unix}:F> (<t:${unix}:R>)\n` +
              `• **Link:** [Join Meeting](${m.channelUrl})\n` +
              (m.reminderRole ? `• **For:** <@&${m.reminderRole}>\n` : '') +
              `• *ID:* \`${m.id}\`\n`
            );
          })
          .join('\n');

        const embed = createInfoEmbed(
          '📅 Upcoming Meetings & Live Sessions',
          listContent + '\n*Run `/meeting book` if you wish to book a 1-on-1 consultation.*'
        );

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          embeds: [createErrorEmbed('Error', err.message || 'Could not fetch meetings.')],
        });
      }
    } else if (sub === 'cancel') {
      const isAllowed = await requireInstructor(interaction);
      if (!isAllowed) return;

      if (!(await safeDeferReply(interaction, true))) return;

      const meetingId = interaction.options.getString('meeting_id', true);
      const success = await meetingService.cancelMeeting(meetingId);

      if (success) {
        await interaction.editReply({
          embeds: [createSuccessEmbed('Meeting Cancelled', `Meeting with ID \`${meetingId}\` has been removed.`)],
        });
      } else {
        await interaction.editReply({
          embeds: [createWarningEmbed('Meeting Not Found', `No scheduled meeting found with ID \`${meetingId}\`.`)],
        });
      }
    } else if (sub === 'book') {
      if (!(await safeDeferReply(interaction, true))) return;

      const embed = createInfoEmbed(
        '🤝 1-on-1 Meeting & Consultation Booking',
        'As an active subscriber, you have direct access to our instructors for personalized reviews and strategy sessions.\n\n' +
        '**How to Book a 1-on-1:**\n' +
        '1. Check upcoming open slots or reach out to an instructor in the server.\n' +
        '2. Prepare your questions, campaign drafts, or video scripts in advance.\n' +
        '3. For immediate assistance, feel free to drop a message in `#support` or DM an instructor.\n\n' +
        '👉 Check group live sessions anytime with: `/meeting list`'
      );

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
