import { Guild } from 'discord.js';
export interface SetupResult {
    roles: Record<string, string>;
    channels: Record<string, string>;
    createdRoles: string[];
    createdChannels: string[];
}
export declare class ServerSetupService {
    /**
     * Automated server setup streamlined to the core Academy requirements:
     * Roles: Admin, Instructor, Elite
     * Channels: welcome, error-log, audit-log
     */
    setupGuild(guild: Guild): Promise<SetupResult>;
    /**
     * Updates or appends key-value pairs in the .env file
     */
    private updateEnvFile;
}
export declare const serverSetupService: ServerSetupService;
