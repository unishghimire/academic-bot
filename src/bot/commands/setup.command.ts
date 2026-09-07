import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { requireAdmin } from '../middleware/permissions.js';
import { serverSetupService } from '../../services/server-setup.service.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embed-builder.js';
import { safeDeferReply } from '../../utils/interaction.utils.js';

export const setupServerCommand = {
  data: new SlashCommandBuilder()
    .setName('setup-server')
    .setDescription('Automatically provision all Academy roles, categories, and channels with proper permissions'),

  async execute(interaction: ChatInputCommandInteraction) {
    const isAllowed = await requireAdmin(interaction);
    if (!isAllowed) return;

    if (!(await safeDeferReply(interaction, false))) return;

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply('This command must be executed inside your Discord server.');
      return;
    }

    try {
      const result = await serverSetupService.setupGuild(guild);

      const embed = createSuccessEmbed(
        'Server Setup Completed!',
        `**Academy Discord Server Structure Provisioned Successfully!**\n\n` +
        `• **Roles Checked/Created (${Object.keys(result.roles).length}):**\n` +
        `  ${Object.keys(result.roles).map(k => `\`${k}\` (<@&${result.roles[k]}>)`).join('\n  ')}\n\n` +
        `• **Channels Checked/Created (${Object.keys(result.channels).length}):**\n` +
        `  ${Object.keys(result.channels).map(k => `\`${k}\` (<#${result.channels[k]}>)`).join('\n  ')}\n\n` +
        `✅ All Role IDs and Channel IDs have been written automatically to your \`.env\` file!\n\n` +
        `⚠️ **Important Next Step:** In **Server Settings ➔ Roles**, make sure to drag the bot's role (**THE ELITE CIRCLE**) above the \`@Premium\` and \`@Tier-1\` roles so it can assign them.`
      );

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Setup Failed', error.message || 'Error occurred during automated setup.')],
      });
    }
  },
};
