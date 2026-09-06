"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDiscordClient = createDiscordClient;
exports.startBot = startBot;
const discord_js_1 = require("discord.js");
const env_js_1 = require("../config/env.js");
const index_js_1 = require("./commands/index.js");
const rate_limiter_js_1 = require("./middleware/rate-limiter.js");
const error_logger_service_js_1 = require("../services/error-logger.service.js");
const role_sync_job_js_1 = require("./jobs/role-sync.job.js");
const expiry_check_job_js_1 = require("./jobs/expiry-check.job.js");
const payment_sync_job_js_1 = require("./jobs/payment-sync.job.js");
const deploy_commands_js_1 = require("./deploy-commands.js");
const logger_js_1 = require("../utils/logger.js");
const embed_builder_js_1 = require("../utils/embed-builder.js");
function createDiscordClient() {
    const client = new discord_js_1.Client({
        intents: [
            discord_js_1.GatewayIntentBits.Guilds,
            discord_js_1.GatewayIntentBits.GuildMembers,
            discord_js_1.GatewayIntentBits.GuildMessages,
        ],
        partials: [discord_js_1.Partials.GuildMember, discord_js_1.Partials.User],
    });
    client.once(discord_js_1.Events.ClientReady, async (readyClient) => {
        logger_js_1.logger.info({ tag: readyClient.user.tag }, '🤖 Discord Custom Academy Bot is online and ready!');
        // Automatically synchronize slash commands if running with live credentials
        if (env_js_1.env.DISCORD_TOKEN !== 'mock_token') {
            try {
                await (0, deploy_commands_js_1.deployCommands)();
            }
            catch (err) {
                logger_js_1.logger.warn({ err }, 'Slash command auto-deployment on ready encountered an error');
            }
        }
        // Initialize scheduled cron and worker jobs
        (0, role_sync_job_js_1.initRoleSyncJob)(client);
        (0, expiry_check_job_js_1.initExpiryCheckJob)(client);
        (0, payment_sync_job_js_1.initPaymentSyncJob)(client);
    });
    client.on(discord_js_1.Events.Error, error => {
        logger_js_1.logger.error({ err: error }, 'Discord client encountered a network or websocket error');
    });
    client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand())
            return;
        const command = index_js_1.commandMap.get(interaction.commandName);
        if (!command) {
            logger_js_1.logger.warn({ command: interaction.commandName }, 'Unknown command received');
            return;
        }
        // Check rate limit (3s cooldown by default)
        if (!(0, rate_limiter_js_1.checkRateLimit)(interaction, 3)) {
            return;
        }
        try {
            await command.execute(interaction);
        }
        catch (error) {
            logger_js_1.logger.error({ err: error, command: interaction.commandName }, 'Error executing slash command');
            await error_logger_service_js_1.errorLogger.report(client, {
                module: 'COMMAND_ROUTER',
                action: interaction.commandName,
                discordId: interaction.user.id,
                error,
            });
            const errorReply = {
                embeds: [(0, embed_builder_js_1.createErrorEmbed)('An Error Occurred', 'There was an error while executing this command. Staff has been notified.')],
                ephemeral: true,
            };
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorReply).catch(() => { });
            }
            else {
                await interaction.reply(errorReply).catch(() => { });
            }
        }
    });
    return client;
}
async function startBot(client) {
    if (env_js_1.env.DISCORD_TOKEN === 'mock_token') {
        logger_js_1.logger.warn('DISCORD_TOKEN is set to mock_token. Discord bot login skipped for dev/mock mode.');
        return;
    }
    try {
        await client.login(env_js_1.env.DISCORD_TOKEN);
    }
    catch (error) {
        logger_js_1.logger.error({ err: error }, 'Failed to login to Discord');
    }
}
//# sourceMappingURL=client.js.map