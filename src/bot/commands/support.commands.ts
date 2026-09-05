import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { createSuccessEmbed, createWarningEmbed, createInfoEmbed } from '../../utils/embed-builder.js';

export const supportCommand = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Open a private support ticket with Academy instructors & staff')
    .addStringOption(opt =>
      opt
        .setName('category')
        .setDescription('Ticket Category')
        .setRequired(true)
        .addChoices(
          { name: 'Billing / Subscription', value: 'billing' },
          { name: 'Course Content / Lesson Help', value: 'course' },
          { name: 'AI Tool / Prompt Troubleshooting', value: 'ai_tools' },
          { name: 'Technical / Account Issue', value: 'technical' }
        )
    )
    .addStringOption(opt =>
      opt.setName('description').setDescription('Briefly describe your issue or question').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('This command can only be used in the Academy Discord server.');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Not Linked', 'Please run `/link` first so staff can identify your account.')],
      });
      return;
    }

    const category = interaction.options.getString('category', true);
    const description = interaction.options.getString('description', true);

    try {
      // Create private channel
      const channelName = `ticket-${interaction.user.username.slice(0, 10)}-${Date.now().toString().slice(-4)}`;
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id, // Student
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
          },
          {
            id: env.ROLE_INSTRUCTOR, // Instructors
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
          },
          {
            id: env.ROLE_ADMIN, // Admins
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
          },
        ],
      });

      // Save ticket in database
      const ticket = await prisma.ticket.create({
        data: {
          userId: user.id,
          category,
          channelId: ticketChannel.id,
          status: 'OPEN',
        },
      });

      // Post initial message into ticket channel
      const introEmbed = createInfoEmbed(
        `🎫 Support Ticket #${ticket.id.slice(-6)}`,
        `**Student:** <@${interaction.user.id}> (\`${user.email}\`)\n` +
        `**Tier:** Tier ${user.currentTier}\n` +
        `**Category:** \`${category}\`\n\n` +
        `**Issue Description:**\n${description}\n\n` +
        `*An instructor or administrator will reply shortly. Use \`/ticket-close\` when resolved.*`
      );

      await ticketChannel.send({ embeds: [introEmbed] });

      await interaction.editReply({
        embeds: [
          createSuccessEmbed(
            'Ticket Created!',
            `Your private support channel has been opened: <#${ticketChannel.id}>. A staff member will assist you there.`
          ),
        ],
      });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [createWarningEmbed('Ticket Creation Failed', error.message || 'Could not create support channel')],
      });
    }
  },
};
