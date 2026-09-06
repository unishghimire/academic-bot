import { Express } from 'express';
import { Client } from 'discord.js';
export declare function createApiServer(discordClient?: Client | null): Express;
