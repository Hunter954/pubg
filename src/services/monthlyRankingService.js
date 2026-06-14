import { prisma } from '../db.js';
import { calculateScore } from '../utils/score.js';

const MONTHS = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, março: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12
};

const STAT_FIELDS = [
  'kills', 'assists', 'damage', 'wins', 'top10s', 'revives', 'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos'
];

export const MONTHLY_ORDER_FIELDS = new Set([
  'score', 'kills', 'assists', 'damage', 'wins', 'top10s', 'revives', 'longestKill', 'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos'
]);

function pad(n) {
  return String(n).padStart(2, '0');
}

function saoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function currentPeriodKey(date = new Date()) {
  const { year, month } = saoPauloParts(date);
  return `${year}-${pad(month)}`;
}

export function previousPeriodKey(date = new Date()) {
  const { year, month } = saoPauloParts(date);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${pad(prevMonth)}`;
}

export function parsePeriodKey(input) {
  if (!input) return currentPeriodKey();
  const value = String(input).trim().toLowerCase();
  const exact = value.match(/^(20\d{2})[-/](0?[1-9]|1[0-2])$/);
  if (exact) return `${exact[1]}-${pad(Number(exact[2]))}`;

  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const month = MONTHS[value] || MONTHS[normalized];
  if (month) {
    const { year } = saoPauloParts();
    return `${year}-${pad(month)}`;
  }
  throw new Error('Período inválido. Use algo como `2026-07` ou `julho`.');
}

export function periodLabel(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${names[month - 1]} ${year}`;
}

export function periodBounds(periodKey) {
  const [year, month] = periodKey.split('-').map(Number);
  // 00:00 no horário de São Paulo equivale aproximadamente a 03:00 UTC.
  // O Brasil não usa horário de verão atualmente, então isso mantém o ciclo mensal correto no Railway/UTC.
  const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 3, 0, 0));
  return { start, end };
}

function diffStats(first, last) {
  const out = {};
  for (const field of STAT_FIELDS) {
    out[field] = Math.max(0, Number(last?.[field] || 0) - Number(first?.[field] || 0));
  }
  out.longestKill = Number(last?.longestKill || 0) > Number(first?.longestKill || 0) ? Number(last.longestKill || 0) : 0;
  out.score = calculateScore(out);
  return out;
}

async function calculateMonthlyRowsFromSnapshots(guildId, periodKey, orderBy = 'score', limit = 10) {
  const { start, end } = periodBounds(periodKey);
  const players = await prisma.player.findMany({ where: { guildId, isActive: true }, orderBy: { pubgNick: 'asc' } });
  const rows = [];

  for (const player of players) {
    const first = await prisma.statSnapshot.findFirst({
      where: { playerId: player.id, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' }
    });
    const last = await prisma.statSnapshot.findFirst({
      where: { playerId: player.id, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'desc' }
    });
    if (!first || !last || first.id === last.id) continue;
    rows.push({ ...diffStats(first, last), player, playerId: player.id, periodKey });
  }

  const field = MONTHLY_ORDER_FIELDS.has(orderBy) ? orderBy : 'score';
  rows.sort((a, b) => Number(b[field] || 0) - Number(a[field] || 0));
  return rows.slice(0, Math.min(Math.max(Number(limit) || 10, 1), 25)).map((row, i) => ({ ...row, position: i + 1 }));
}

export async function getMonthlyRanking(guildId, inputPeriod, orderBy = 'score', limit = 10) {
  const periodKey = parsePeriodKey(inputPeriod);
  const field = MONTHLY_ORDER_FIELDS.has(orderBy) ? orderBy : 'score';

  const closed = await prisma.monthlyRanking.findMany({
    where: { guildId, periodKey },
    include: { player: true },
    orderBy: { [field]: 'desc' },
    take: Math.min(Math.max(Number(limit) || 10, 1), 25)
  });

  if (closed.length) {
    return { periodKey, label: periodLabel(periodKey), closed: true, rows: closed.map((row, i) => ({ ...row, position: i + 1 })) };
  }

  const rows = await calculateMonthlyRowsFromSnapshots(guildId, periodKey, field, limit);
  return { periodKey, label: periodLabel(periodKey), closed: false, rows };
}

export async function closeMonthlyRanking(guildId, periodKey = previousPeriodKey()) {
  const { rows } = await getMonthlyRanking(guildId, periodKey, 'score', 25);
  const [year, month] = periodKey.split('-').map(Number);

  for (const row of rows) {
    await prisma.monthlyRanking.upsert({
      where: { periodKey_playerId: { periodKey, playerId: row.playerId } },
      update: {
        guildId, year, month, position: row.position,
        score: row.score, kills: row.kills, assists: row.assists, damage: row.damage,
        wins: row.wins, top10s: row.top10s, revives: row.revives, longestKill: row.longestKill,
        matchesPlayed: row.matchesPlayed, deaths: row.deaths, teamKills: row.teamKills,
        headshotKills: row.headshotKills, dbnos: row.dbnos
      },
      create: {
        guildId, periodKey, year, month, playerId: row.playerId, position: row.position,
        score: row.score, kills: row.kills, assists: row.assists, damage: row.damage,
        wins: row.wins, top10s: row.top10s, revives: row.revives, longestKill: row.longestKill,
        matchesPlayed: row.matchesPlayed, deaths: row.deaths, teamKills: row.teamKills,
        headshotKills: row.headshotKills, dbnos: row.dbnos
      }
    });
  }

  return { periodKey, label: periodLabel(periodKey), rows };
}

export async function listMonthlyHistory(guildId) {
  const rows = await prisma.monthlyRanking.findMany({
    where: { guildId },
    distinct: ['periodKey'],
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 24
  });
  return rows.map((row) => ({ periodKey: row.periodKey, label: periodLabel(row.periodKey) }));
}
