import { SlashCommandBuilder, ChannelType, EmbedBuilder, } from 'discord.js';
import { requireInstructor } from '../middleware/permissions.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embed-builder.js';
import { auditService } from '../../services/audit.service.js';
import { COLORS, EMBED_FOOTER } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { safeDeferReply } from '../../utils/interaction.utils.js';
export const announceCommand = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Broadcast an official Academy announcement to the server (Staff only)')
        .addStringOption(opt => opt.setName('message').setDescription('Announcement body text').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('Announcement headline / title (optional)').setRequired(false))
        .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Target text channel (defaults to #welcome)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
        .addRoleOption(opt => opt
        .setName('ping_role')
        .setDescription('Role to ping for this announcement (e.g. @Elite, defaults to none)')
        .setRequired(false)),
    async execute(interaction) {
        const isAllowed = await requireInstructor(interaction);
        if (!isAllowed)
            return;
        if (!(await safeDeferReply(interaction, true)))
            return;
        const message = interaction.options.getString('message', true);
        const title = interaction.options.getString('title') || '📢 Academy Official Announcement';
        const chosenChannel = interaction.options.getChannel('channel');
        const pingRole = interaction.options.getRole('ping_role');
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply('This command can only be used inside the server.');
            return;
        }
        // Determine target channel (chosenChannel -> #welcome -> currentChannel)
        let targetChannel = chosenChannel;
        if (!targetChannel) {
            targetChannel = (guild.channels.cache.find(c => (c.name.toLowerCase() === 'welcome' || c.id === env.CHANNEL_WELCOME) && c.isTextBased()) || interaction.channel);
        }
        if (!targetChannel || !targetChannel.isTextBased()) {
            await interaction.editReply({
                embeds: [createErrorEmbed('Channel Not Found', 'Could not locate a suitable text channel to post this announcement.')],
            });
            return;
        }
        try {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor(COLORS.PRIMARY)
                .setDescription(message)
                .setFooter({
                text: `${EMBED_FOOTER.text} • Announced by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL(),
            })
                .setTimestamp();
            const pingContent = pingRole ? `<@&${pingRole.id}>` : undefined;
            const sentMsg = await targetChannel.send({
                content: pingContent,
                embeds: [embed],
            });
            // Audit log the announcement
            await auditService.log({
                actorType: 'ADMIN',
                actorId: interaction.user.id,
                action: 'ADMIN_BROADCAST',
                targetType: 'CHANNEL',
                targetId: targetChannel.id,
                reason: title,
                after: { message, channelId: targetChannel.id, pingRole: pingRole?.id },
            });
            await interaction.editReply({
                embeds: [
                    createSuccessEmbed('Announcement Published! 📢', `Successfully posted your announcement to <#${targetChannel.id}>!\n\n` +
                        `• **Title:** ${title}\n` +
                        (pingRole ? `• **Mentioned:** <@&${pingRole.id}>\n` : '') +
                        `• **Link:** [Jump to Announcement](${sentMsg.url})`),
                ],
            });
        }
        catch (err) {
            await interaction.editReply({
                embeds: [createErrorEmbed('Broadcast Failed', err.message || 'Could not post announcement.')],
            });
        }
    },
};
//# sourceMappingURL=announce.command.js.map