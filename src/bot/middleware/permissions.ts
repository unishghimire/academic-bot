import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { env } from '../../config/env.js';
import { createErrorEmbed } from '../../utils/embed-builder.js';

export function isStaff(member: GuildMember): boolean {
  return member.roles.cache.has(env.ROLE_ADMIN) || member.roles.cache.has(env.ROLE_INSTRUCTOR);
}

export function isAdmin(member: GuildMember): boolean {
  return member.roles.cache.has(env.ROLE_ADMIN) || member.permissions.has('Administrator');
}

export function isInstructor(member: GuildMember): boolean {
  return member.roles.cache.has(env.ROLE_INSTRUCTOR) || isAdmin(member);
}

export function isPremium(member: GuildMember): boolean {
  return member.roles.cache.has(env.ROLE_PREMIUM) || isAdmin(member);
}

export async function requireAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member || !isAdmin(member)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        embeds: [createErrorEmbed('Permission Denied', 'This command requires the **Administrator** role.')],
        ephemeral: true,
      }).catch(() => {});
    }
    return false;
  }
  return true;
}

export async function requireInstructor(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member || !isInstructor(member)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        embeds: [createErrorEmbed('Permission Denied', 'This command requires the **Instructor** role.')],
        ephemeral: true,
      }).catch(() => {});
    }
    return false;
  }
  return true;
}

export async function requirePremium(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const member = interaction.member as GuildMember;
  if (!member || !isPremium(member)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        embeds: [createErrorEmbed('Premium Required', 'This feature is reserved for active **Premium Academy** subscribers.\nUse `/link` to connect your subscription.')],
        ephemeral: true,
      }).catch(() => {});
    }
    return false;
  }
  return true;
}
