"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportCommand = void 0;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../../db/client.js");
const env_js_1 = require("../../config/env.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
exports.supportCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('support')
        .setDescription('Open a private support ticket with Academy instructors & staff')
        .addStringOption(opt => opt
        .setName('category')
        .setDescription('Ticket Category')
        .setRequired(true)
        .addChoices({ name: 'Billing / Subscription', value: 'billing' }, { name: 'Course Content / Lesson Help', value: 'course' }, { name: 'AI Tool / Prompt Troubleshooting', value: 'ai_tools' }, { name: 'Technical / Account Issue', value: 'technical' }))
        .addStringOption(opt => opt.setName('description').setDescription('Briefly describe your issue or question').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply('This command can only be used in the Academy Discord server.');
            return;
        }
        const user = await client_js_1.prisma.user.findUnique({
            where: { discordId: interaction.user.id },
        });
        if (!user) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Not Linked', 'Please run `/link` first so staff can identify your account.')],
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
                type: discord_js_1.ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        deny: [discord_js_1.PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id, // Student
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.AttachFiles],
                    },
                    {
                        id: env_js_1.env.ROLE_INSTRUCTOR, // Instructors
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.AttachFiles],
                    },
                    {
                        id: env_js_1.env.ROLE_ADMIN, // Admins
                        allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.AttachFiles],
                    },
                ],
            });
            // Save ticket in database
            const ticket = await client_js_1.prisma.ticket.create({
                data: {
                    userId: user.id,
                    category,
                    channelId: ticketChannel.id,
                    status: 'OPEN',
                },
            });
            // Post initial message into ticket channel
            const introEmbed = (0, embed_builder_js_1.createInfoEmbed)(`🎫 Support Ticket #${ticket.id.slice(-6)}`, `**Student:** <@${interaction.user.id}> (\`${user.email}\`)\n` +
                `**Tier:** Tier ${user.currentTier}\n` +
                `**Category:** \`${category}\`\n\n` +
                `**Issue Description:**\n${description}\n\n` +
                `*An instructor or administrator will reply shortly. Use \`/ticket-close\` when resolved.*`);
            await ticketChannel.send({ embeds: [introEmbed] });
            await interaction.editReply({
                embeds: [
                    (0, embed_builder_js_1.createSuccessEmbed)('Ticket Created!', `Your private support channel has been opened: <#${ticketChannel.id}>. A staff member will assist you there.`),
                ],
            });
        }
        catch (error) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createWarningEmbed)('Ticket Creation Failed', error.message || 'Could not create support channel')],
            });
        }
    },
};
//# sourceMappingURL=support.commands.js.map