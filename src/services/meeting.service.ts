import { PrismaClient, LiveClass } from '@prisma/client';
import { prisma as defaultPrisma, isDatabaseOnline } from '../db/client.js';
import { localStore } from '../db/local-store.js';
import { logger } from '../utils/logger.js';

export interface ScheduleMeetingInput {
  title: string;
  topic: string;
  scheduledAt: Date;
  channelUrl: string;
  reminderRole?: string | null;
}

export class MeetingService {
  constructor(private db: PrismaClient = defaultPrisma) {}

  private isOffline(): boolean {
    return this.db === defaultPrisma && !isDatabaseOnline();
  }

  /**
   * Schedule a new meeting/class
   */
  async scheduleMeeting(input: ScheduleMeetingInput): Promise<LiveClass> {
    if (!input.title || !input.topic || !input.scheduledAt || !input.channelUrl) {
      throw new Error('Title, topic, date/time, and meeting URL are required.');
    }

    if (this.isOffline()) {
      const meeting: LiveClass = {
        id: `meet_${Date.now()}`,
        title: input.title.trim(),
        topic: input.topic.trim(),
        scheduledAt: input.scheduledAt,
        channelUrl: input.channelUrl.trim(),
        reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localStore.saveLiveClass(meeting);
      logger.info({ meetingId: meeting.id }, 'Meeting scheduled in local offline storage');
      return meeting;
    }

    try {
      const meeting = await this.db.liveClass.create({
        data: {
          title: input.title.trim(),
          topic: input.topic.trim(),
          scheduledAt: input.scheduledAt,
          channelUrl: input.channelUrl.trim(),
          reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
        },
      });
      logger.info({ meetingId: meeting.id }, 'Meeting scheduled successfully in database');
      return meeting;
    } catch (err) {
      logger.warn({ err }, 'Database save failed, using local offline storage for meeting');
      const meeting: LiveClass = {
        id: `meet_${Date.now()}`,
        title: input.title.trim(),
        topic: input.topic.trim(),
        scheduledAt: input.scheduledAt,
        channelUrl: input.channelUrl.trim(),
        reminderRole: input.reminderRole ? input.reminderRole.trim() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localStore.saveLiveClass(meeting);
      return meeting;
    }
  }

  /**
   * List upcoming meetings (from now onwards)
   */
  async listUpcomingMeetings(): Promise<LiveClass[]> {
    const now = new Date();

    if (this.isOffline()) {
      const all: LiveClass[] = localStore.getLiveClasses();
      return all
        .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000) // within 15 min past or in future
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }

    try {
      return await this.db.liveClass.findMany({
        where: {
          scheduledAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
        },
        orderBy: { scheduledAt: 'asc' },
      });
    } catch {
      const all: LiveClass[] = localStore.getLiveClasses();
      return all
        .filter(m => new Date(m.scheduledAt).getTime() >= now.getTime() - 15 * 60 * 1000)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
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
