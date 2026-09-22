import { PrismaClient, LiveClass } from '@prisma/client';
import { prisma as defaultPrisma, isPostgresOnline } from '../db/client.js';
import { localStore } from '../db/local-store.js';
import { logger } from '../utils/logger.js';

export interface ScheduleMeetingInput {
  title: string;
  topic?: string;
  scheduledAt: Date;
  channelUrl?: string;
  reminderRole?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  targetChannelId?: string | null;
}

export class MeetingService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  private isOffline(): boolean {
    return this.db === defaultPrisma && !isPostgresOnline();
  }

  /**
   * Schedule a new meeting/class with optional category for automated voice channel creation
   */
  async scheduleMeeting(input: ScheduleMeetingInput): Promise<LiveClass> {
    if (!input.title || !input.scheduledAt) {
      throw new Error('Title and date/time are required to schedule a meeting.');
    }

    const meetingUrl = input.channelUrl?.trim() || 'Auto Voice Channel';
    const topic = input.topic?.trim() || input.title.trim();

    const meetingData: any = {
      id: `meet_${Date.now()}`,
      title: input.title.trim(),
      topic,
      scheduledAt: input.scheduledAt,
      channelUrl: meetingUrl,
      reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
      categoryId: input.categoryId || null,
      categoryName: input.categoryName || null,
      targetChannelId: input.targetChannelId || null,
      isLive: false,
      announced: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.isOffline()) {
      localStore.saveLiveClass(meetingData);
      logger.info({ meetingId: meetingData.id }, 'Meeting scheduled in local storage');
      return meetingData;
    }

    try {
      const meeting = await this.db.liveClass.create({
        data: {
          title: meetingData.title,
          topic: meetingData.topic,
          scheduledAt: meetingData.scheduledAt,
          channelUrl: meetingData.channelUrl,
          reminderRole: meetingData.reminderRole,
        },
      });
      // Save supplementary categoryId to local store
      localStore.saveLiveClass({ ...meetingData, id: meeting.id });
      logger.info({ meetingId: meeting.id }, 'Meeting scheduled in database');
      return { ...meetingData, ...meeting };
    } catch (err) {
      logger.warn({ err }, 'Database save failed, using local offline storage for meeting');
      localStore.saveLiveClass(meetingData);
      return meetingData;
    }
  }

  /**
   * List upcoming meetings (from now onwards)
   */
  async listUpcomingMeetings(): Promise<LiveClass[]> {
    const now = new Date();

    if (this.isOffline()) {
      const all: any[] = localStore.getLiveClasses();
      return all
        .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }

    try {
      const dbMeetings = await this.db.liveClass.findMany({
        where: {
          scheduledAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
        },
        orderBy: { scheduledAt: 'asc' },
      });
      return dbMeetings;
    } catch {
      const all: any[] = localStore.getLiveClasses();
      return all
        .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
  }

  /**
   * Retrieve meetings that have reached scheduled time and are not yet marked LIVE
   */
  async getDueUnannouncedMeetings(now: Date = new Date()): Promise<any[]> {
    const localAll: any[] = localStore.getLiveClasses();
    return localAll.filter(m => {
      const scheduledTime = new Date(m.scheduledAt).getTime();
      return scheduledTime <= now.getTime() && !m.isLive;
    });
  }

  /**
   * Mark meeting as live, recording the created voice channel ID and direct link
   */
  async markMeetingLive(id: string, voiceChannelId?: string, channelUrl?: string): Promise<any | null> {
    const existing = localStore.findLiveClassById(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      isLive: true,
      announced: true,
      voiceChannelId: voiceChannelId || existing.voiceChannelId,
      channelUrl: channelUrl || existing.channelUrl,
      updatedAt: new Date(),
    };
    localStore.saveLiveClass(updated);
    return updated;
  }

  /**
   * Cancel/delete a scheduled meeting
   */
  async cancelMeeting(id: string): Promise<boolean> {
    if (this.isOffline()) {
      return localStore.deleteLiveClass(id);
    }

    try {
      await this.db.liveClass.delete({ where: { id } });
      localStore.deleteLiveClass(id);
      return true;
    } catch {
      return localStore.deleteLiveClass(id);
    }
  }

  /**
   * Get single meeting by ID
   */
  async getMeeting(id: string): Promise<LiveClass | null> {
    if (this.isOffline()) {
      return localStore.findLiveClassById(id);
    }

    try {
      return await this.db.liveClass.findUnique({ where: { id } });
    } catch {
      return localStore.findLiveClassById(id);
    }
  }
}

export const meetingService = new MeetingService();
