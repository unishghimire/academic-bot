import { ChannelType, PermissionFlagsBits, EmbedBuilder, } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { COLORS, EMBED_FOOTER } from '../config/constants.js';
export class ServerSetupService {
    /**
     * Automated server setup streamlined to the core Academy requirements:
     * Roles: Admin, Instructor, Elite
     * Channels: welcome, error-log, audit-log
     */
    async setupGuild(guild) {
        logger.info({ guildId: guild.id, guildName: guild.name }, 'Starting streamlined server setup...');
        const createdRoles = [];
        const createdChannels = [];
        // --- STEP 1: CREATE OR FIND CORE ROLES ---
        const roleDefinitions = [
            {
                key: 'ROLE_ADMIN',
                name: 'Admin',
                color: '#ED4245', // Red
                hoist: true,
                mentionable: false,
                permissions: [PermissionFlagsBits.Administrator],
            },
            {
                key: 'ROLE_INSTRUCTOR',
                name: 'Instructor',
                color: '#3498DB', // Blue
                hoist: true,
                mentionable: true,
                permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers],
            },
            {
                key: 'ROLE_ELITE',
                name: 'Elite',
                color: '#F1C40F', // Gold
                hoist: true,
                mentionable: true,
            },
        ];
        const roleMap = {};
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
                }
                catch (err) {
                    logger.error({ err, roleName: def.name }, 'Failed to create role');
                    continue;
                }
            }
            roleMap[def.key] = role.id;
        }
        // Map ROLE_PREMIUM to ROLE_ELITE for backward compatibility
        if (roleMap['ROLE_ELITE']) {
            roleMap['ROLE_PREMIUM'] = roleMap['ROLE_ELITE'];
        }
        const adminRoleId = roleMap['ROLE_ADMIN'];
        const instructorRoleId = roleMap['ROLE_INSTRUCTOR'];
        const eliteRoleId = roleMap['ROLE_ELITE'];
        // --- STEP 2: CREATE 3 ESSENTIAL CHANNELS ---
        const channelMap = {};
        const existingChannels = await guild.channels.fetch();
        const getOrCreateChannel = async (name, type, parentId, permissionOverwrites) => {
            let ch = existingChannels.find(c => c && c.name.toLowerCase() === name.toLowerCase() && c.type === type);
            if (!ch) {
                const newCh = await guild.channels.create({
                    name,
                    type: type,
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
        // 1. #welcome — Public channel where welcome notices & broadcasts appear
        const welcomeCh = await getOrCreateChannel('welcome', ChannelType.GuildText, undefined, [
            {
                id: guild.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages],
            },
            ...(adminRoleId
                ? [{ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }]
                : []),
            ...(instructorRoleId
                ? [{ id: instructorRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }]
                : []),
        ]);
        // 2. #error-log — Staff private error logging channel
        const errorLogCh = await getOrCreateChannel('error-log', ChannelType.GuildText, undefined, [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            ...(adminRoleId
                ? [{ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]
                : []),
            ...(instructorRoleId
                ? [{ id: instructorRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]
                : []),
        ]);
        // 3. #audit-log — Staff private security & subscription audit channel
        const auditLogCh = await getOrCreateChannel('audit-log', ChannelType.GuildText, undefined, [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            ...(adminRoleId
                ? [{ id: adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]
                : []),
            ...(instructorRoleId
                ? [{ id: instructorRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }]
                : []),
        ]);
        channelMap['CHANNEL_WELCOME'] = welcomeCh.id;
        channelMap['CHANNEL_ERROR_LOGS'] = errorLogCh.id;
        channelMap['CHANNEL_AUDIT_LOGS'] = auditLogCh.id;
        // Send introductory welcome message if freshly created
        if (createdChannels.includes('#welcome') && welcomeCh.isTextBased()) {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🏛️ Welcome to The Elite Circle Academy')
                .setColor(COLORS.PRIMARY)
                .setDescription(`Welcome to the official Academy Discord server!\n\n` +
                `• **Subscribers:** Once your subscription is approved, you will receive the **@Elite** role automatically.\n` +
                `• **Active Role:** **@Elite** unlocks private course categories, resources, and live voice training sessions.\n` +
                `• **Commands:**\n` +
                `  - \`/link\` — Link your student payment account\n` +
                `  - \`/subscription\` — Check your subscription status and renewal date\n` +
                `  - \`/meeting list\` — View upcoming live classes & scheduled meetings`)
                .setFooter(EMBED_FOOTER)
                .setTimestamp();
            await welcomeCh.send({ embeds: [welcomeEmbed] }).catch(() => { });
        }
        // --- STEP 3: UPDATE .ENV FILE AUTOMATICALLY ---
        this.updateEnvFile({
            DISCORD_GUILD_ID: guild.id,
            ...roleMap,
            ...channelMap,
        });
        logger.info('Streamlined server setup completed and .env updated.');
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
    updateEnvFile(updates) {
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}="${value}"`);
            }
            else {
                envContent += `\n${key}="${value}"`;
            }
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    }
}
export const serverSetupService = new ServerSetupService();
//# sourceMappingURL=server-setup.service.js.map