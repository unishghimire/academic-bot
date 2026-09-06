import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
export declare const linkCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
export declare const subscriptionCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
export declare const progressCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
export declare const continueCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
