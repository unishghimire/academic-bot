"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupServerCommand = void 0;
const discord_js_1 = require("discord.js");
const permissions_js_1 = require("../middleware/permissions.js");
const server_setup_service_js_1 = require("../../services/server-setup.service.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
exports.setupServerCommand = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('setup-server')
        .setDescription('Automatically provision all Academy roles, categories, and channels with proper permissions'),
    async execute(interaction) {
        const isAllowed = await (0, permissions_js_1.requireAdmin)(interaction);
        if (!isAllowed)
            return;
        await interaction.deferReply();
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply('This command must be executed inside your Discord server.');
            return;
        }
        try {
            const result = await server_setup_service_js_1.serverSetupService.setupGuild(guild);
            const embed = (0, embed_builder_js_1.createSuccessEmbed)('Server Setup Completed!', `**Academy Discord Server Structure Provisioned Successfully!**\n\n` +
                `• **Roles Checked/Created (${Object.keys(result.roles).length}):**\n` +
                `  ${Object.keys(result.roles).map(k => `\`${k}\` (<@&${result.roles[k]}>)`).join('\n  ')}\n\n` +
                `• **Channels Checked/Created (${Object.keys(result.channels).length}):**\n` +
                `  ${Object.keys(result.channels).map(k => `\`${k}\` (<#${result.channels[k]}>)`).join('\n  ')}\n\n` +
                `✅ All Role IDs and Channel IDs have been written automatically to your \`.env\` file!\n\n` +
                `⚠️ **Important Next Step:** In **Server Settings ➔ Roles**, make sure to drag the bot's role (**THE ELITE CIRCLE**) above the \`@Premium\` and \`@Tier-1\` roles so it can assign them.`);
            await interaction.editReply({ embeds: [embed] });
        }
        catch (error) {
            await interaction.editReply({
                embeds: [(0, embed_builder_js_1.createErrorEmbed)('Setup Failed', error.message || 'Error occurred during automated setup.')],
            });
        }
    },
};
//# sourceMappingURL=setup.command.js.map