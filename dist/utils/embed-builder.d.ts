import { EmbedBuilder } from 'discord.js';
export declare function createBaseEmbed(title: string, color?: number): EmbedBuilder;
export declare function createSuccessEmbed(title: string, description: string): EmbedBuilder;
export declare function createWarningEmbed(title: string, description: string): EmbedBuilder;
export declare function createErrorEmbed(title: string, description: string): EmbedBuilder;
export declare function createInfoEmbed(title: string, description: string): EmbedBuilder;
export declare function createTierEmbed(tier: number, description: string): EmbedBuilder;
