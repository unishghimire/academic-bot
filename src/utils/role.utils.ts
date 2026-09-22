import { Guild, Role } from 'discord.js';
import { env } from '../config/env.js';

/**
 * Resolves a Discord role from a guild:
 * 1. Matches by role ID if present in guild
 * 2. Fallback to matching by case-insensitive name if ID is from another server
 */
export function resolveGuildRole(guild: Guild, envId?: string, nameFallback?: string): Role | null {
  const roles = guild.roles?.cache;
  if (!roles) return null;

  if (envId) {
    const roleById = roles.get(envId);
    if (roleById) return roleById;
  }
  if (nameFallback) {
    const roleList: Role[] = Array.from(roles.values ? roles.values() : []);
    const roleByName = roleList.find(
      r =>
        r.name?.toLowerCase() === nameFallback.toLowerCase() ||
        r.name?.toLowerCase().includes(nameFallback.toLowerCase())
    );
    if (roleByName) return roleByName;
  }
  return null;
}

/**
 * Resolves the Elite subscription role in the guild (matches @Elite or @💎 ELITE)
 */
export function resolveEliteRole(guild: Guild, preferredRoleId?: string | null): Role | null {
  const roles = guild.roles?.cache;
  if (!roles) return null;

  if (preferredRoleId) {
    const r = roles.get(preferredRoleId);
    if (r) return r;
  }
  if (env.ROLE_ELITE && env.ROLE_ELITE !== 'role_elite') {
    const r = roles.get(env.ROLE_ELITE);
    if (r) return r;
  }
  const roleList: Role[] = Array.from(roles.values ? roles.values() : []);
  return roleList.find(r => r.name?.toLowerCase().includes('elite')) || null;
}
