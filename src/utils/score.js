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
