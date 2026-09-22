/**
 * Resolves a Discord role from a guild:
 * 1. Matches by role ID if present in guild
 * 2. Fallback to matching by case-insensitive name if ID is from another server
 */
export function resolveGuildRole(guild, envId, nameFallback) {
    if (envId) {
        const roleById = guild.roles.cache.get(envId);
        if (roleById)
            return roleById;
    }
    if (nameFallback) {
        const roleByName = guild.roles.cache.find(r => r.name.toLowerCase() === nameFallback.toLowerCase());
        if (roleByName)
            return roleByName;
    }
    return null;
}
//# sourceMappingURL=role.utils.js.map