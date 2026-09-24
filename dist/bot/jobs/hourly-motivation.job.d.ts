import { Client } from 'discord.js';
export interface MotivationQuote {
    quote: string;
    author: string;
    tag: string;
    challenge: string;
}
export declare const MOTIVATION_QUOTES: MotivationQuote[];
/**
 * Dispatches an hourly discipline/motivation embed to the designated channel.
 */
export declare function postHourlyMotivation(client: Client, forceChannelId?: string | null): Promise<{
    success: boolean;
    channelId?: string;
    quote?: MotivationQuote;
    error?: string;
}>;
/**
 * Initializes the automated hourly motivation worker.
 * Runs at the top of every hour (0 * * * *).
 */
export declare function initHourlyMotivationJob(client: Client): void;
