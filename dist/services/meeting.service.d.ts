import { PrismaClient, LiveClass } from '@prisma/client';
export interface ScheduleMeetingInput {
    title: string;
    topic: string;
    scheduledAt: Date;
    channelUrl: string;
    reminderRole?: string | null;
}
export declare class MeetingService {
    private db;
    constructor(db?: PrismaClient);
    private isOffline;
    /**
     * Schedule a new meeting/class
     */
    scheduleMeeting(input: ScheduleMeetingInput): Promise<LiveClass>;
    /**
     * List upcoming meetings (from now onwards)
     */
    listUpcomingMeetings(): Promise<LiveClass[]>;
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
