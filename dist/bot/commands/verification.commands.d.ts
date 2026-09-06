import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
export declare const verifyProofCommand: {
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
export declare const paymentMethodsCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
export declare const portalCommand: {
    data: SlashCommandBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
