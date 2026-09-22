import { env } from '../../config/env.js';
import { createErrorEmbed } from '../../utils/embed-builder.js';
export function isStaff(member) {
    return member.roles.cache.has(env.ROLE_ADMIN) || member.roles.cache.has(env.ROLE_INSTRUCTOR);
}
export function isAdmin(member) {
    return member.roles.cache.has(env.ROLE_ADMIN) || member.permissions.has('Administrator');
}
export function isInstructor(member) {
    return member.roles.cache.has(env.ROLE_INSTRUCTOR) || isAdmin(member);
}
export function isPremium(member) {
    return member.roles.cache.has(env.ROLE_PREMIUM) || isAdmin(member);
}
export async function requireAdmin(interaction) {
    const member = interaction.member;
    if (!member || !isAdmin(member)) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
                embeds: [createErrorEmbed('Permission Denied', 'This command requires the **Administrator** role.')],
                ephemeral: true,
            }).catch(() => { });
        }
        return false;
    }
    return true;
}
export async function requireInstructor(interaction) {
    const member = interaction.member;
    if (!member || !isInstructor(member)) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
                embeds: [createErrorEmbed('Permission Denied', 'This command requires the **Instructor** role.')],
                ephemeral: true,
            }).catch(() => { });
        }
        return false;
    }
    return true;
}
export async function requirePremium(interaction) {
    const member = interaction.member;
    if (!member || !isPremium(member)) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
                embeds: [createErrorEmbed('Premium Required', 'This feature is reserved for active **Premium Academy** subscribers.\nUse `/link` to connect your subscription.')],
                ephemeral: true,
            }).catch(() => { });
        }
        return false;
    }
    return true;
}
//# sourceMappingURL=permissions.js.map