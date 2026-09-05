import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { serverSetupService } from '../src/services/server-setup.service.js';

dotenv.config();

async function run() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  console.log('⚡ Starting Academy Discord Server Provisioner...\n');

  if (!token || token === 'your_bot_token_here') {
    console.error('❌ Error: DISCORD_TOKEN is missing in .env');
    process.exit(1);
  }

  if (!guildId || guildId === 'your_guild_id_here') {
    console.error('❌ Error: DISCORD_GUILD_ID is missing in .env');
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(token);
    console.log(`🤖 Logged in as: ${client.user?.tag}`);

    const guild = await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      console.error(`\n❌ Error: Bot is NOT in the server with ID "${guildId}".`);
      console.log(`👉 Please click this link to invite the bot to your server first:`);
      console.log(`   https://discord.com/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot%20applications.commands\n`);
      client.destroy();
      process.exit(1);
    }

    console.log(`🏰 Found Guild: "${guild.name}" (ID: ${guild.id})`);
    console.log('🔄 Checking and creating Academy roles, categories, and channels...\n');

    const result = await serverSetupService.setupGuild(guild);

    console.log('====================================================');
    console.log('🎉 ACADEMY SERVER SETUP COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
    console.log('\n🎭 ROLES CONFIGURED:');
    for (const [key, id] of Object.entries(result.roles)) {
      console.log(`  • ${key.padEnd(16)} : ID ${id}`);
    }

    console.log('\n📢 CHANNELS CONFIGURED:');
    for (const [key, id] of Object.entries(result.channels)) {
      console.log(`  • ${key.padEnd(22)} : ID ${id}`);
    }

    console.log('\n💾 Updated .env automatically with all IDs.');
    console.log('\n⚠️  CRITICAL REMINDER:');
    console.log('   In Discord Server Settings -> Roles, drag the bot role ("THE ELITE CIRCLE")');
    console.log('   ABOVE the "@Premium" and "@Tier-1" roles so it has permission to assign them.\n');

    client.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Fatal error running setup script:', error.message);
    client.destroy();
    process.exit(1);
  }
}

run();
