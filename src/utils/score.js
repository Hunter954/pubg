export function calculateScore(stats) {
  return Math.max(0, Math.round(
    (stats.kills || 0) * 10 +
    (stats.assists || 0) * 5 +
    (stats.damage || 0) / 100 +
    (stats.wins || 0) * 60 +
    (stats.top10s || 0) * 15 +
    (stats.revives || 0) * 4 +
    (stats.longestKill || 0) / 20 -
    (stats.teamKills || 0) * 30
  ));
}

export function getRankName(score) {
  if (score >= 2000) return '🔥 Lenda do Drop';
  if (score >= 1000) return '🥇 Ouro do Squad';
  if (score >= 500) return '🥈 Prata da Zona';
  return '🥉 Bronze do Drop';
}

export function getRankKey(score) {
  if (score >= 2000) return 'lenda';
  if (score >= 1000) return 'ouro';
  if (score >= 500) return 'prata';
  return 'bronze';
}

export function getPlayerTitle(stats = {}) {
  const score = Number(stats.score || 0);
  if (Number(stats.teamKills || 0) >= 3) return '⚠️ Perigo Público';
  if (Number(stats.revives || 0) >= 80) return '🚑 Médico do Squad';
  if (Number(stats.longestKill || 0) >= 350) return '🎯 Sniper';
  if (Number(stats.wins || 0) >= 25 || Number(stats.top10s || 0) >= 100) return '🐔 Estrategista';
  if (Number(stats.kills || 0) >= 400 || score >= 8000) return '💀 Carrasco';
  if (Number(stats.headshotKills || 0) >= 150) return '🧠 Mira Fria';
  return getRankName(score);
}

export function getPlayStyle(stats = {}) {
  const kills = Number(stats.kills || 0);
  const damage = Number(stats.damage || 0);
  const revives = Number(stats.revives || 0);
  const longest = Number(stats.longestKill || 0);
  const wins = Number(stats.wins || 0);
  const top10s = Number(stats.top10s || 0);
  const teamKills = Number(stats.teamKills || 0);
  const matches = Math.max(Number(stats.matchesPlayed || 0), 1);

  if (teamKills >= 3) return 'Perigo público';
  if (revives / matches >= 0.35 || revives >= 80) return 'Suporte';
  if (longest >= 350) return 'Sniper';
  if (wins / matches >= 0.08 || top10s / matches >= 0.45) return 'Estratégico';
  if (kills / matches >= 1.5 || damage / matches >= 250) return 'Agressivo';
  return 'Equilibrado';
}
