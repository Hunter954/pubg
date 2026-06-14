import axios from 'axios';
import { config } from '../config.js';

const client = axios.create({
  baseURL: 'https://api.pubg.com',
  timeout: 20000,
  headers: {
    Authorization: `Bearer ${config.pubgApiKey}`,
    Accept: 'application/vnd.api+json'
  }
});

function apiErrorMessage(error) {
  const status = error?.response?.status;
  const title = error?.response?.data?.errors?.[0]?.title;
  if (status) return `${status}${title ? ` - ${title}` : ''}`;
  return error?.message || 'Erro desconhecido na PUBG API';
}

export async function findPlayerByName(playerName, shard = config.pubgShard) {
  try {
    const url = `/shards/${shard}/players`;
    const { data } = await client.get(url, { params: { 'filter[playerNames]': playerName } });
    const player = data?.data?.[0];
    if (!player) return null;
    return {
      id: player.id,
      name: player.attributes?.name || playerName,
      shard
    };
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw new Error(`PUBG API player lookup falhou: ${apiErrorMessage(error)}`);
  }
}

export async function listSeasons(shard = config.pubgShard) {
  try {
    const { data } = await client.get(`/shards/${shard}/seasons`);
    return data?.data || [];
  } catch (error) {
    throw new Error(`PUBG API seasons falhou: ${apiErrorMessage(error)}`);
  }
}

export async function getCurrentSeasonId(shard = config.pubgShard) {
  const seasons = await listSeasons(shard);
  // A API costuma retornar a temporada mais nova no começo da lista.
  // Se o atributo isCurrentSeason não vier marcado, usamos seasons[0], não o último item antigo.
  const current = seasons.find((s) => s.attributes?.isCurrentSeason === true) || seasons[0];
  return current?.id;
}

export async function getPlayerSeasonStats(accountId, seasonId, shard = config.pubgShard) {
  try {
    const { data } = await client.get(`/shards/${shard}/players/${accountId}/seasons/${seasonId}`);
    return data?.data?.attributes?.gameModeStats || {};
  } catch (error) {
    throw new Error(`Stats não encontradas para season ${seasonId}: ${apiErrorMessage(error)}`);
  }
}

export function normalizeGameModeStats(rawStats = {}) {
  return {
    kills: rawStats.kills || 0,
    assists: rawStats.assists || 0,
    damage: rawStats.damageDealt || 0,
    wins: rawStats.wins || 0,
    top10s: rawStats.top10s || 0,
    revives: rawStats.revives || 0,
    longestKill: rawStats.longestKill || 0,
    matchesPlayed: rawStats.roundsPlayed || 0,
    deaths: rawStats.losses || Math.max((rawStats.roundsPlayed || 0) - (rawStats.wins || 0), 0),
    teamKills: rawStats.teamKills || 0,
    headshotKills: rawStats.headshotKills || 0,
    dbnos: rawStats.dBNOs || 0
  };
}
