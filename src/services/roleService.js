import { config } from '../config.js';
import { getRankKey } from '../utils/score.js';

export async function updateMemberRankRole(guild, member, score) {
  const desiredKey = getRankKey(score);
  const desiredRoleId = config.roleIds[desiredKey];
  const rankRoleIds = Object.values(config.roleIds).filter(Boolean);
  if (!desiredRoleId || !rankRoleIds.length) return;

  const toRemove = rankRoleIds.filter((id) => id !== desiredRoleId && member.roles.cache.has(id));
  if (toRemove.length) await member.roles.remove(toRemove).catch(() => null);
  if (!member.roles.cache.has(desiredRoleId)) await member.roles.add(desiredRoleId).catch(() => null);
}
