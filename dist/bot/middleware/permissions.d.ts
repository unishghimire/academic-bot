import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
export declare function isStaff(member: GuildMember): boolean;
export declare function isAdmin(member: GuildMember): boolean;
export declare function isInstructor(member: GuildMember): boolean;
export declare function isPremium(member: GuildMember): boolean;
export declare function requireAdmin(interaction: ChatInputCommandInteraction): Promise<boolean>;
export declare function requireInstructor(interaction: ChatInputCommandInteraction): Promise<boolean>;
export declare function requirePremium(interaction: ChatInputCommandInteraction): Promise<boolean>;
