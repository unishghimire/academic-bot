import cron from 'node-cron';
import { Client } from 'discord.js';
export declare function initExpiryCheckJob(client: Client): cron.ScheduledTask;
