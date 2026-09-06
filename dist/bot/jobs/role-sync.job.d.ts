import cron from 'node-cron';
import { Client } from 'discord.js';
export declare function initRoleSyncJob(client: Client): cron.ScheduledTask;
