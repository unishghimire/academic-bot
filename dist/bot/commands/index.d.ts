/**
 * PHASE 1 ACTIVE COMMANDS:
 * Payment verification, role granting, subscription tracking, and meeting scheduling.
 * All other features are safely hidden until user requests expansion.
 */
export declare const allCommands: ({
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
} | {
    data: import("discord.js").SlashCommandOptionsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
})[];
/**
 * DORMANT / HIDDEN COMMANDS (Preserved for future phases when ready to launch):
 * Course lessons, submissions, grading reviews, gamification XP/ranks/leaderboards.
 */
export declare const dormantFutureCommands: ({
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
} | {
    data: import("discord.js").SlashCommandOptionsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
})[];
export declare const commandMap: Map<string, {
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
} | {
    data: import("discord.js").SlashCommandOptionsOnlyBuilder;
    execute(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void>;
}>;
