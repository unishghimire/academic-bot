import { Guild, TextChannel } from 'discord.js';
/**
 * Robustly resolves a public announcement or welcome text channel:
 * 1. Checks specific preferred/passed channel ID
 * 2. Checks env.CHANNEL_WELCOME if it exists in this guild
 * 3. Checks env.CHANNEL_ANNOUNCEMENTS if it exists in this guild
 * 4. Fuzzy match: Any text channel whose name contains 'welcome' (e.g. 👋・welcome, welcome)
 * 5. Fuzzy match: Any text channel whose name contains 'announcement' (e.g. 📢・announcements, elite-announcement)
 * 6. Fuzzy match: Any text channel whose name contains 'general'
 */
export declare function resolveAnnouncementChannel(guild: Guild, preferredChannelId?: string | null): Promise<TextChannel | null>;
