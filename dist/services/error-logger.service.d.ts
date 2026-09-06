import { Client } from 'discord.js';
export interface ErrorReportParams {
    module: string;
    action: string;
    error: unknown;
    userId?: string;
    discordId?: string;
    metadata?: Record<string, unknown>;
}
export declare class ErrorLoggerService {
    /**
     * Sanitizes errors to prevent exposing internal tokens, passwords, or connection strings.
     */
    private sanitize;
    /**
     * Reports sanitized error to internal logger and Discord #error-logs channel
     */
    report(client: Client | null, params: ErrorReportParams): Promise<void>;
}
export declare const errorLogger: ErrorLoggerService;
