import { ChatInputCommandInteraction } from 'discord.js';
export declare const submitCommand: {
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
