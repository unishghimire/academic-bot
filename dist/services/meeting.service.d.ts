import { PrismaClient, LiveClass } from '@prisma/client';
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
export declare class MeetingService {
    private db;
    constructor(db?: PrismaClient);
    private isOffline;
    /**
     * Schedule a new meeting/class with optional category for automated voice channel creation
     */
    scheduleMeeting(input: ScheduleMeetingInput): Promise<LiveClass>;
    /**
     * List upcoming meetings (from now onwards)
     */
    listUpcomingMeetings(): Promise<LiveClass[]>;
    /**
     * Retrieve meetings that have reached scheduled time and are not yet marked LIVE
     */
    getDueUnannouncedMeetings(now?: Date): Promise<any[]>;
    /**
     * Mark meeting as live, recording the created voice channel ID and direct link
     */
    markMeetingLive(id: string, voiceChannelId?: string, channelUrl?: string): Promise<any | null>;
    /**
     * Cancel/delete a scheduled meeting
     */
    cancelMeeting(id: string): Promise<boolean>;
    /**
     * Get single meeting by ID
     */
    getMeeting(id: string): Promise<LiveClass | null>;
}
export declare const meetingService: MeetingService;
