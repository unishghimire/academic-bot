import { Guild } from 'discord.js';
export interface SetupResult {
    roles: Record<string, string>;
    channels: Record<string, string>;
    createdRoles: string[];
    createdChannels: string[];
}
export declare class ServerSetupService {
    /**
     * Automatically provisions all Academy roles, categories, and channels with proper permissions.
     * Updates the .env file with the created IDs.
     */
    setupGuild(guild: Guild): Promise<SetupResult>;
    /**
     * Updates or appends key-value pairs in the .env file
     */
    private updateEnvFile;
}
export declare const serverSetupService: ServerSetupService;
