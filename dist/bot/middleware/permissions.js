"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStaff = isStaff;
exports.isAdmin = isAdmin;
exports.isInstructor = isInstructor;
exports.isPremium = isPremium;
exports.requireAdmin = requireAdmin;
exports.requireInstructor = requireInstructor;
exports.requirePremium = requirePremium;
const env_js_1 = require("../../config/env.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
function isStaff(member) {
    return member.roles.cache.has(env_js_1.env.ROLE_ADMIN) || member.roles.cache.has(env_js_1.env.ROLE_INSTRUCTOR);
}
function isAdmin(member) {
    return member.roles.cache.has(env_js_1.env.ROLE_ADMIN) || member.permissions.has('Administrator');
}
function isInstructor(member) {
    return member.roles.cache.has(env_js_1.env.ROLE_INSTRUCTOR) || isAdmin(member);
}
function isPremium(member) {
    return member.roles.cache.has(env_js_1.env.ROLE_PREMIUM) || isAdmin(member);
}
async function requireAdmin(interaction) {
    const member = interaction.member;
    if (!member || !isAdmin(member)) {
        await interaction.reply({
            embeds: [(0, embed_builder_js_1.createErrorEmbed)('Permission Denied', 'This command requires the **Administrator** role.')],
            ephemeral: true,
        });
        return false;
    }
    return true;
}
async function requireInstructor(interaction) {
    const member = interaction.member;
    if (!member || !isInstructor(member)) {
        await interaction.reply({
            embeds: [(0, embed_builder_js_1.createErrorEmbed)('Permission Denied', 'This command requires the **Instructor** role.')],
            ephemeral: true,
        });
        return false;
    }
    return true;
}
async function requirePremium(interaction) {
    const member = interaction.member;
    if (!member || !isPremium(member)) {
        await interaction.reply({
            embeds: [(0, embed_builder_js_1.createErrorEmbed)('Premium Required', 'This feature is reserved for active **Premium Academy** subscribers.\nUse `/link` to connect your subscription.')],
            ephemeral: true,
        });
        return false;
    }
    return true;
}
//# sourceMappingURL=permissions.js.map