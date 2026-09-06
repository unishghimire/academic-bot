import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
export declare const setupServerCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
