import { Router } from 'express';
import { Client } from 'discord.js';
export declare function createStripeRouter(discordClient?: Client | null): Router;
