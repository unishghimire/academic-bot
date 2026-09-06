import {
  Guild,
  ChannelType,
  PermissionFlagsBits,
  Role,
  ColorResolvable,
  GuildBasedChannel,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface SetupResult {
  roles: Record<string, string>;
  channels: Record<string, string>;
  createdRoles: string[];
  createdChannels: string[];
}

export class ServerSetupService {
  /**
   * Automatically provisions all Academy roles, categories, and channels with proper permissions.
   * Updates the .env file with the created IDs.
   */
  async setupGuild(guild: Guild): Promise<SetupResult> {
    logger.info({ guildId: guild.id, guildName: guild.name }, 'Starting automated server setup...');

    const createdRoles: string[] = [];
    const createdChannels: string[] = [];

    // --- STEP 1: CREATE OR FIND ROLES ---
    const roleDefinitions: Array<{
      key: string;
      name: string;
      color: ColorResolvable;
      hoist: boolean;
      mentionable: boolean;
      permissions?: bigint[];
    }> = [
      {
        key: 'ROLE_ADMIN',
        name: 'Admin',
        color: '#ED4245',
        hoist: true,
        mentionable: false,
        permissions: [PermissionFlagsBits.Administrator],
      },
      {
        key: 'ROLE_INSTRUCTOR',
        name: 'Instructor',
        color: '#3498DB',
        hoist: true,
        mentionable: true,
        permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers],
      },
      {
        key: 'ROLE_GRADUATE',
        name: 'Graduate',
        color: '#F1C40F', // Gold
        hoist: true,
        mentionable: false,
      },
      {
        key: 'ROLE_TIER_3',
        name: 'Tier-3',
        color: '#9B59B6', // Purple
        hoist: true,
        mentionable: false,
      },
      {
        key: 'ROLE_TIER_2',
        name: 'Tier-2',
        color: '#5865F2', // Blurple
        hoist: true,
        mentionable: false,
      },
      {
        key: 'ROLE_TIER_1',
        name: 'Tier-1',
        color: '#57F287', // Green
        hoist: true,
        mentionable: false,
      },
      {
        key: 'ROLE_PREMIUM',
        name: 'Premium',
        color: '#E67E22', // Orange/Gold
        hoist: true,
        mentionable: false,
      },
    ];

    const roleMap: Record<string, string> = {};
    const guildRoles = await guild.roles.fetch();

    for (const def of roleDefinitions) {
      let role = guildRoles.find(r => r.name.toLowerCase() === def.name.toLowerCase());

      if (!role) {
        try {
          role = await guild.roles.create({
            name: def.name,
            color: def.color,
            hoist: def.hoist,
            mentionable: def.mentionable,
            permissions: def.permissions ? def.permissions.reduce((acc, p) => acc | p, 0n) : undefined,
            reason: 'Automated Academy Bot server setup',
          });
          createdRoles.push(`@${def.name}`);
          logger.info({ roleName: def.name, roleId: role.id }, 'Created role');
        } catch (err: any) {
          logger.error({ err, roleName: def.name }, 'Failed to create role');
          continue;
        }
      }

      roleMap[def.key] = role.id;
    }

    const adminRole = roleMap['ROLE_ADMIN'];
    const instructorRole = roleMap['ROLE_INSTRUCTOR'];
    const tier1Role = roleMap['ROLE_TIER_1'];
    const tier2Role = roleMap['ROLE_TIER_2'];
    const tier3Role = roleMap['ROLE_TIER_3'];
    const premiumRole = roleMap['ROLE_PREMIUM'];

    // --- STEP 2: CREATE CATEGORIES AND CHANNELS ---
    const channelMap: Record<string, string> = {};
    const existingChannels = await guild.channels.fetch();

    // Helper to find or create channel
    const getOrCreateChannel = async (
      name: string,
      type: ChannelType.GuildText | ChannelType.GuildCategory,
      parentId?: string,
      permissionOverwrites?: any[]
    ): Promise<GuildBasedChannel> => {
      let ch = existingChannels.find(
        c => c && c.name.toLowerCase() === name.toLowerCase() && c.type === type
      );

      if (!ch) {
        const newCh = await guild.channels.create({
          name,
          type: type as any,
          parent: parentId,
          permissionOverwrites,
          reason: 'Automated Academy Bot server setup',
        });
        createdChannels.push(`#${name}`);
        logger.info({ channelName: name, channelId: newCh.id }, 'Created channel');
        return newCh;
      }

      return ch;
    };

    // Category 1: ACADEMY INFO
    const infoCat = await getOrCreateChannel('📢 ACADEMY INFO', ChannelType.GuildCategory);
    const welcomeCh = await getOrCreateChannel('welcome', ChannelType.GuildText, infoCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    ]);
    const rulesCh = await getOrCreateChannel('rules', ChannelType.GuildText, infoCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    ]);
    const announceCh = await getOrCreateChannel('announcements', ChannelType.GuildText, infoCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    ]);

    // Category 2: TIER 1 COURSE - AI VIDEO ADS
    const tier1Cat = await getOrCreateChannel('📚 TIER 1: AI VIDEO ADS', ChannelType.GuildCategory, undefined, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier1Role ? [{ id: tier1Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier1AnnounceCh = await getOrCreateChannel('tier-1-announcements', ChannelType.GuildText, tier1Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier1Role ? [{ id: tier1Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    const tier1LessonsCh = await getOrCreateChannel('tier-1-lessons', ChannelType.GuildText, tier1Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier1Role ? [{ id: tier1Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
    ]);

    const tier1ResourcesCh = await getOrCreateChannel('tier-1-resources', ChannelType.GuildText, tier1Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier1Role ? [{ id: tier1Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier1DiscussionCh = await getOrCreateChannel('tier-1-discussion', ChannelType.GuildText, tier1Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier1Role ? [{ id: tier1Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    // Category 3: TIER 2 COURSE - ADVANCED AI PROMPTING
    const tier2Cat = await getOrCreateChannel('🚀 TIER 2: ADVANCED AI PROMPTING', ChannelType.GuildCategory, undefined, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier2AnnounceCh = await getOrCreateChannel('tier-2-announcements', ChannelType.GuildText, tier2Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    const tier2LessonsCh = await getOrCreateChannel('tier-2-lessons', ChannelType.GuildText, tier2Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
    ]);

    const tier2ResourcesCh = await getOrCreateChannel('tier-2-resources', ChannelType.GuildText, tier2Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier2DiscussionCh = await getOrCreateChannel('tier-2-discussion', ChannelType.GuildText, tier2Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier2Role ? [{ id: tier2Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    // Category 4: TIER 3 COURSE - AGENCY SCALE & MASTERY
    const tier3Cat = await getOrCreateChannel('👑 TIER 3: AGENCY SCALE MASTERY', ChannelType.GuildCategory, undefined, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier3AnnounceCh = await getOrCreateChannel('tier-3-announcements', ChannelType.GuildText, tier3Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    const tier3LessonsCh = await getOrCreateChannel('tier-3-lessons', ChannelType.GuildText, tier3Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : []),
    ]);

    const tier3ResourcesCh = await getOrCreateChannel('tier-3-resources', ChannelType.GuildText, tier3Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);

    const tier3DiscussionCh = await getOrCreateChannel('tier-3-discussion', ChannelType.GuildText, tier3Cat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(tier3Role ? [{ id: tier3Role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] : []),
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    // Category 3: COMMUNITY & SHOWCASE
    const commCat = await getOrCreateChannel('💬 COMMUNITY & SHOWCASE', ChannelType.GuildCategory);
    const leaderboardCh = await getOrCreateChannel('leaderboard', ChannelType.GuildText, commCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
    ]);
    const showcaseCh = await getOrCreateChannel('showcase', ChannelType.GuildText, commCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(premiumRole ? [{ id: premiumRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }] : []),
    ]);
    const challengesCh = await getOrCreateChannel('challenges', ChannelType.GuildText, commCat.id);
    const liveClassesCh = await getOrCreateChannel('live-classes', ChannelType.GuildText, commCat.id);

    // Category 4: SUPPORT
    const supportCat = await getOrCreateChannel('🎫 SUPPORT', ChannelType.GuildCategory);
    const supportCh = await getOrCreateChannel('support', ChannelType.GuildText, supportCat.id);

    // Category 5: STAFF ONLY
    const staffCat = await getOrCreateChannel('🔒 STAFF ONLY', ChannelType.GuildCategory, undefined, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
    ]);

    const auditCh = await getOrCreateChannel('audit-logs', ChannelType.GuildText, staffCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel] }] : []),
    ]);

    const errorCh = await getOrCreateChannel('error-logs', ChannelType.GuildText, staffCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel] }] : []),
    ]);

    const assignmentReviewsCh = await getOrCreateChannel('assignment-reviews', ChannelType.GuildText, staffCat.id, [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(adminRole ? [{ id: adminRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }] : []),
      ...(instructorRole ? [{ id: instructorRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }] : []),
    ]);

    channelMap['CHANNEL_WELCOME'] = welcomeCh.id;
    channelMap['CHANNEL_RULES'] = rulesCh.id;
    channelMap['CHANNEL_ANNOUNCEMENTS'] = announceCh.id;
    channelMap['CHANNEL_LEADERBOARD'] = leaderboardCh.id;
    channelMap['CHANNEL_SHOWCASE'] = showcaseCh.id;
    channelMap['CHANNEL_SUPPORT'] = supportCh.id;
    channelMap['CHANNEL_ERROR_LOGS'] = errorCh.id;
    channelMap['CHANNEL_AUDIT_LOGS'] = auditCh.id;
    channelMap['CHANNEL_ASSIGNMENT_REVIEWS'] = assignmentReviewsCh.id;
    channelMap['CHANNEL_TIER_1_LESSONS'] = tier1LessonsCh.id;
    channelMap['CHANNEL_TIER_1_RESOURCES'] = tier1ResourcesCh.id;
    channelMap['CHANNEL_TIER_2_LESSONS'] = tier2LessonsCh.id;
    channelMap['CHANNEL_TIER_2_RESOURCES'] = tier2ResourcesCh.id;
    channelMap['CHANNEL_TIER_3_LESSONS'] = tier3LessonsCh.id;
    channelMap['CHANNEL_TIER_3_RESOURCES'] = tier3ResourcesCh.id;

    // --- STEP 3: UPDATE .ENV FILE AUTOMATICALLY ---
    this.updateEnvFile({
      DISCORD_GUILD_ID: guild.id,
      ...roleMap,
      ...channelMap,
    });

    logger.info('Server setup finished successfully and .env updated.');

    return {
      roles: roleMap,
      channels: channelMap,
      createdRoles,
      createdChannels,
    };
  }

  /**
   * Updates or appends key-value pairs in the .env file
   */
  private updateEnvFile(updates: Record<string, string>): void {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}="${value}"`);
      } else {
        envContent += `\n${key}="${value}"`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  }
}

export const serverSetupService = new ServerSetupService();
