import { Client } from 'discord.js';
/**
 * Checks for scheduled meetings that have reached their scheduled start time,
 * creates their dedicated voice channel in the designated category,
 * and broadcasts the live announcement with direct join link.
 */
export declare function runMeetingLiveCheck(client: Client): Promise<void>;
/**
 * Initializes the 1-minute live meeting cron job
 */
export declare function initMeetingLiveJob(client: Client): void;
