"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommands = deployCommands;
const discord_js_1 = require("discord.js");
const env_js_1 = require("../config/env.js");
const index_js_1 = require("./commands/index.js");
const logger_js_1 = require("../utils/logger.js");
async function deployCommands() {
    if (env_js_1.env.DISCORD_TOKEN === 'mock_token') {
        logger_js_1.logger.warn('Skipping Discord command deployment: DISCORD_TOKEN is set to mock.');
        return;
    }
    const rest = new discord_js_1.REST({ version: '10' }).setToken(env_js_1.env.DISCORD_TOKEN);
    const commandData = index_js_1.allCommands.map(cmd => cmd.data.toJSON());
    try {
        logger_js_1.logger.info({ count: commandData.length }, 'Started refreshing application (/) commands.');
        await rest.put(discord_js_1.Routes.applicationGuildCommands(env_js_1.env.DISCORD_CLIENT_ID, env_js_1.env.DISCORD_GUILD_ID), { body: commandData });
        logger_js_1.logger.info('Successfully reloaded application (/) commands.');
    }
    catch (error) {
        logger_js_1.logger.error({ err: error }, 'Failed to deploy Discord application commands.');
    }
}
if (process.argv[1]?.endsWith('deploy-commands.ts')) {
    deployCommands().then(() => process.exit(0));
}
//# sourceMappingURL=deploy-commands.js.map