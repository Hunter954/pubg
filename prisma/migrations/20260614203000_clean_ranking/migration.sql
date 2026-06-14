CREATE TABLE IF NOT EXISTS "CleanMatch" (
  "id" SERIAL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "mapName" TEXT,
  "gameMode" TEXT,
  "playedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CleanMatch_guildId_matchId_key" ON "CleanMatch"("guildId", "matchId");
CREATE INDEX IF NOT EXISTS "CleanMatch_guildId_playedAt_idx" ON "CleanMatch"("guildId", "playedAt");

CREATE TABLE IF NOT EXISTS "CleanPlayerMatchStats" (
  "id" SERIAL PRIMARY KEY,
  "cleanMatchId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "botKillsIgnored" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "damage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "top10s" INTEGER NOT NULL DEFAULT 0,
  "revives" INTEGER NOT NULL DEFAULT 0,
  "longestKill" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "teamKills" INTEGER NOT NULL DEFAULT 0,
  "headshotKills" INTEGER NOT NULL DEFAULT 0,
  "dbnos" INTEGER NOT NULL DEFAULT 0,
  "botDbnosIgnored" INTEGER NOT NULL DEFAULT 0,
  "placement" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CleanPlayerMatchStats_cleanMatchId_fkey" FOREIGN KEY ("cleanMatchId") REFERENCES "CleanMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CleanPlayerMatchStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CleanPlayerMatchStats_cleanMatchId_playerId_key" ON "CleanPlayerMatchStats"("cleanMatchId", "playerId");
CREATE INDEX IF NOT EXISTS "CleanPlayerMatchStats_playerId_idx" ON "CleanPlayerMatchStats"("playerId");

CREATE TABLE IF NOT EXISTS "CleanPlayerStats" (
  "id" SERIAL PRIMARY KEY,
  "playerId" INTEGER NOT NULL UNIQUE,
  "seasonId" TEXT,
  "gameMode" TEXT NOT NULL DEFAULT 'squad',
  "score" INTEGER NOT NULL DEFAULT 0,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "botKillsIgnored" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "damage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "top10s" INTEGER NOT NULL DEFAULT 0,
  "revives" INTEGER NOT NULL DEFAULT 0,
  "longestKill" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "teamKills" INTEGER NOT NULL DEFAULT 0,
  "headshotKills" INTEGER NOT NULL DEFAULT 0,
  "dbnos" INTEGER NOT NULL DEFAULT 0,
  "botDbnosIgnored" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CleanPlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
