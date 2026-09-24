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

/**
 * Robustly resolves the Discipline / Motivation text channel (#🗿・discipline):
 * 1. Checks specific preferred/passed channel ID
 * 2. Checks env.CHANNEL_DISCIPLINE if configured and exists in guild
 * 3. Checks env.CHANNEL_MOTIVATION if configured and exists in guild
 * 4. Fuzzy match: Any text channel containing 'discipline' (e.g. 🗿・discipline)
 * 5. Fuzzy match: Any text channel containing 'motivation' (e.g. daily-motivation)
 * 6. Fallback: resolveAnnouncementChannel(guild)
 */
export async function resolveDisciplineChannel(
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

    if (env.CHANNEL_DISCIPLINE && channels.has(env.CHANNEL_DISCIPLINE)) {
      const ch = channels.get(env.CHANNEL_DISCIPLINE);
      if (ch && (typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) {
        return ch as TextChannel;
      }
    }

    if (env.CHANNEL_MOTIVATION && channels.has(env.CHANNEL_MOTIVATION)) {
      const ch = channels.get(env.CHANNEL_MOTIVATION);
      if (ch && (typeof ch.isTextBased === 'function' ? ch.isTextBased() : true)) {
        return ch as TextChannel;
      }
    }

    const channelList: any[] = Array.from(channels.values ? channels.values() : []);
    const textChannels = channelList.filter(
      c => c && (typeof c.isTextBased === 'function' ? c.isTextBased() : true)
    );

    // 1. Matches "discipline" (e.g. 🗿・discipline, discipline)
    const disciplineCh = textChannels.find(c => c.name?.toLowerCase().includes('discipline'));
    if (disciplineCh) return disciplineCh as TextChannel;

    // 2. Matches "motivation" (e.g. daily-motivation, motivation)
    const motivationCh = textChannels.find(c => c.name?.toLowerCase().includes('motivation'));
    if (motivationCh) return motivationCh as TextChannel;

    // 3. Fallback to general or announcement
    return resolveAnnouncementChannel(guild);
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to resolve discipline channel');
    return null;
  }
}

