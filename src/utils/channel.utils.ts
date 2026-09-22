import { Guild, TextChannel } from 'discord.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Robustly resolves a public announcement or welcome text channel:
 * 1. Checks specific preferred/passed channel ID
 * 2. Checks env.CHANNEL_WELCOME if it exists in this guild
 * 3. Checks env.CHANNEL_ANNOUNCEMENTS if it exists in this guild
 * 4. Fuzzy match: Any text channel whose name contains 'welcome' (e.g. 👋・welcome, welcome)
 * 5. Fuzzy match: Any text channel whose name contains 'announcement' (e.g. 📢・announcements, elite-announcement)
 * 6. Fuzzy match: Any text channel whose name contains 'general'
 */
export async function resolveAnnouncementChannel(
  guild: Guild,
  preferredChannelId?: string | null
): Promise<TextChannel | null> {
  try {
    let channels: any = guild.channels.cache;
    if (typeof guild.channels.fetch === 'function') {
      try {
        const fetched = await guild.channels.fetch();
        if (fetched) channels = fetched;
      } catch {
        channels = guild.channels.cache;
      }
    }

    if (preferredChannelId && channels.has(preferredChannelId)) {
      const ch = channels.get(preferredChannelId);
      if (ch && (typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) {
        return ch as TextChannel;
      }
    }

    if (env.CHANNEL_WELCOME && channels.has(env.CHANNEL_WELCOME)) {
      const ch = channels.get(env.CHANNEL_WELCOME);
      if (ch && (typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) {
        return ch as TextChannel;
      }
    }

    if (env.CHANNEL_ANNOUNCEMENTS && channels.has(env.CHANNEL_ANNOUNCEMENTS)) {
      const ch = channels.get(env.CHANNEL_ANNOUNCEMENTS);
      if (ch && (typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) {
        return ch as TextChannel;
      }
    }

    const channelList: any[] = Array.from(channels.values ? channels.values() : []);
    const textChannels = channelList.filter(
      c => c && (typeof c.isTextBased === 'function' ? c.isTextBased() : true)
    );

    // 1. Matches "welcome" (e.g. 👋・welcome, welcome)
    const welcomeCh = textChannels.find(c => c.name?.toLowerCase().includes('welcome'));
    if (welcomeCh) return welcomeCh as TextChannel;

    // 2. Matches "announcement" (e.g. 📢・announcements, elite-announcement)
    const announceCh = textChannels.find(c => c.name?.toLowerCase().includes('announcement'));
    if (announceCh) return announceCh as TextChannel;

    // 3. Matches "general"
    const generalCh = textChannels.find(c => c.name?.toLowerCase().includes('general'));
    if (generalCh) return generalCh as TextChannel;

    return (textChannels[0] as TextChannel) || null;
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to resolve announcement channel');
    return null;
  }
}
