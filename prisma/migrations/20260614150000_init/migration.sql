CREATE TABLE "GuildConfig" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "rankingChannelId" TEXT,
    "adminRoleId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'steam',
    "gameMode" TEXT NOT NULL DEFAULT 'squad-fpp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT,
    "pubgNick" TEXT NOT NULL,
    "pubgAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'steam',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerStats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" TEXT,
    "gameMode" TEXT NOT NULL DEFAULT 'squad-fpp',
    "score" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
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
    "raw" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatSnapshot" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" TEXT,
    "gameMode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "damage" DOUBLE PRECISION NOT NULL,
    "wins" INTEGER NOT NULL,
    "top10s" INTEGER NOT NULL,
    "revives" INTEGER NOT NULL,
    "longestKill" DOUBLE PRECISION NOT NULL,
    "matchesPlayed" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "teamKills" INTEGER NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");
CREATE UNIQUE INDEX "Player_guildId_discordId_key" ON "Player"("guildId", "discordId");
CREATE UNIQUE INDEX "Player_guildId_pubgAccountId_key" ON "Player"("guildId", "pubgAccountId");
CREATE INDEX "Player_guildId_isActive_idx" ON "Player"("guildId", "isActive");
CREATE UNIQUE INDEX "PlayerStats_playerId_key" ON "PlayerStats"("playerId");
CREATE INDEX "StatSnapshot_playerId_createdAt_idx" ON "StatSnapshot"("playerId", "createdAt");

ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatSnapshot" ADD CONSTRAINT "StatSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
