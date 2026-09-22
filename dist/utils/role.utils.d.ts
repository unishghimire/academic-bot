import { Guild, Role } from 'discord.js';
/**
 * Resolves a Discord role from a guild:
 * 1. Matches by role ID if present in guild
 * 2. Fallback to matching by case-insensitive name if ID is from another server
 */
export declare function resolveGuildRole(guild: Guild, envId?: string, nameFallback?: string): Role | null;
/**
 * Resolves the Elite subscription role in the guild (matches @Elite or @💎 ELITE)
 */
export declare function resolveEliteRole(guild: Guild, preferredRoleId?: string | null): Role | null;
