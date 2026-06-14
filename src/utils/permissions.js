import { PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';

export function isBotAdmin(interaction) {
  if (!interaction.member) return false;
  if (interaction.member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = config.adminRoleId;
  if (!roleId) return false;
  return interaction.member.roles?.cache?.has(roleId) || false;
}

export async function requireAdmin(interaction) {
  if (isBotAdmin(interaction)) return true;
  await interaction.reply({ content: '🚫 Você precisa ser admin ou ter o cargo ADMIN_ROLE_ID para usar este comando.', ephemeral: true });
  return false;
}
