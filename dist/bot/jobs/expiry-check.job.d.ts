import cron from 'node-cron';
import { Client } from 'discord.js';
/**
 * Runs the subscription expiry sweep and 3-day renewal warning checks
 */
export declare function runExpirySweep(client: Client): Promise<void>;
/**
 * Initializes the automated 3-minute recurring subscription expiry check worker
 */
export declare function initExpiryCheckJob(client: Client): cron.ScheduledTask;
