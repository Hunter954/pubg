import { ActionRowBuilder, AttachmentBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';
import { findPlayerByName } from '../services/pubgApi.js';
import { syncGuild, getRanking, getPlayerStatsByDiscord, getMvp } from '../services/rankingService.js';
import { ensureGuildConfig } from '../services/guildConfigService.js';
import { updateMemberRankRole } from '../services/roleService.js';
import { requireAdmin } from '../utils/permissions.js';
import { getRankName } from '../utils/score.js';
import { int, num, kd } from '../utils/format.js';


const SECRET_KEY_SELECT_ID = 'pubg_secret_key_map_select';

const SECRET_KEY_MAPS = {
  erangel: {
    label: 'Erangel',
    title: '🗝️ Erangel — Salas Secretas / Chaves',
    description: 'Mapa com posições de salas/chaves secretas em Erangel.',
    fileName: 'erangel-secret-rooms.jpg'
  },
  miramar: {
    label: 'Miramar',
    title: '🗝️ Miramar — Salas Secretas / Chaves',
    description: 'Mapa com posições de salas/chaves secretas em Miramar.',
    fileName: 'miramar-secret-rooms.jpg'
  },
  rondo: {
    label: 'Rondo',
    title: '🗝️ Rondo — Salas Secretas / Chaves',
    description: 'Mapa com posições de salas/chaves secretas em Rondo.',
    fileName: 'rondo-secret-rooms.jpg'
  },
  paramo: {
    label: 'Paramo',
    title: '🗝️ Paramo — Salas Secretas / Chaves',
    description: 'Mapa com posições de salas/chaves secretas em Paramo.',
    fileName: 'paramo-secret-rooms.jpg'
  },
  deston: {
    label: 'Deston',
    title: '🗝️ Deston — Security Key Card / Security Rooms',
    description: 'Mapa com posições de cartões, salas e caminhões de segurança em Deston.',
    fileName: 'deston-security-keycard.jpg'
  },
  taego: {
    label: 'Taego',
    title: '🗝️ Taego — Salas Secretas',
    description: 'Mapa com posições de salas secretas em Taego.',
    fileName: 'taego-secret-rooms.jpg'
  },
  vikendi: {
    label: 'Vikendi',
    title: '🗝️ Vikendi — Secret Key / Salas Secretas',
    description: 'Mapa com posições de chaves e salas secretas em Vikendi.',
    fileName: 'vikendi-secret-key-locations.jpg'
  }
};

function buildSecretKeySelectRow(selectedValue = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SECRET_KEY_SELECT_ID)
      .setPlaceholder('Selecione o mapa')
      .addOptions(Object.entries(SECRET_KEY_MAPS).map(([value, map]) => ({
        label: map.label,
        value,
        description: map.description.slice(0, 100),
        default: value === selectedValue
      })))
  );
}

function buildSecretKeyMapPayload(mapValue) {
  const map = SECRET_KEY_MAPS[mapValue] || SECRET_KEY_MAPS.erangel;
  const imageUrl = new URL(`../assets/secret-keys/${map.fileName}`, import.meta.url);
  const attachment = new AttachmentBuilder(fileURLToPath(imageUrl), { name: map.fileName });
  const embed = new EmbedBuilder()
    .setTitle(map.title)
    .setDescription(`${map.description}\n\nUse o seletor abaixo para trocar de mapa.`)
    .setImage(`attachment://${map.fileName}`)
    .setFooter({ text: 'PUBG Ranking Bot • mapas de referência enviados pela comunidade' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [buildSecretKeySelectRow(mapValue)],
    files: [attachment]
  };
}

export async function handleInteraction(interaction) {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === SECRET_KEY_SELECT_ID) {
      return handleChaveSelect(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'admin') return handleAdmin(interaction);
    if (interaction.commandName === 'rank') return handleRank(interaction);
    if (interaction.commandName === 'perfil') return handlePerfil(interaction);
    if (interaction.commandName === 'mvp') return handleMvp(interaction);
    if (interaction.commandName === 'drop') return handleDrop(interaction);
    if (interaction.commandName === 'chave') return handleChave(interaction);
    if (interaction.commandName === 'desafio') return handleDesafio(interaction);
  } catch (error) {
    console.error('[interaction:error]', { message: error.message, status: error?.response?.status, data: error?.response?.data });
    const msg = `❌ Erro: ${error.message}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => null);
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => null);
  }
}

async function handleAdmin(interaction) {
  if (!(await requireAdmin(interaction))) return;
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  await ensureGuildConfig(guildId);

  if (sub === 'cadastrar') {
    await interaction.deferReply({ ephemeral: true });
    const user = interaction.options.getUser('usuario', true);
    const nick = interaction.options.getString('nick', true).trim();
    const cfg = await ensureGuildConfig(guildId);
    const pubgPlayer = await findPlayerByName(nick, cfg.platform);
    if (!pubgPlayer) return interaction.editReply(`❌ Não encontrei o nick **${nick}** na PUBG API.`);

    await prisma.player.upsert({
      where: { guildId_discordId: { guildId, discordId: user.id } },
      update: {
        discordName: user.username,
        pubgNick: pubgPlayer.name,
        pubgAccountId: pubgPlayer.id,
        platform: pubgPlayer.shard,
        isActive: true
      },
      create: {
        guildId,
        discordId: user.id,
        discordName: user.username,
        pubgNick: pubgPlayer.name,
        pubgAccountId: pubgPlayer.id,
        platform: pubgPlayer.shard
      }
    });

    return interaction.editReply(`✅ Jogador cadastrado: ${user} → **${pubgPlayer.name}**`);
  }

  if (sub === 'remover') {
    const user = interaction.options.getUser('usuario', true);
    await prisma.player.updateMany({ where: { guildId, discordId: user.id }, data: { isActive: false } });
    return interaction.reply({ content: `🗑️ ${user} foi removido/desativado do ranking.`, ephemeral: true });
  }

  if (sub === 'listar') {
    const players = await prisma.player.findMany({ where: { guildId, isActive: true }, orderBy: { pubgNick: 'asc' } });
    if (!players.length) return interaction.reply({ content: 'Nenhum jogador cadastrado ainda.', ephemeral: true });
    const text = players.map((p, i) => `${i + 1}. <@${p.discordId}> — **${p.pubgNick}**`).join('\n');
    return interaction.reply({ content: text, ephemeral: true });
  }

  if (sub === 'sync') {
    await interaction.deferReply();
    const result = await syncGuild(guildId);
    const ok = result.results.filter((r) => r.ok).length;
    const fail = result.results.filter((r) => !r.ok).length;

    for (const r of result.results.filter((x) => x.ok)) {
      const member = await interaction.guild.members.fetch(r.player.discordId).catch(() => null);
      if (member) await updateMemberRankRole(interaction.guild, member, r.score);
    }

    
    const failLines = result.results
      .filter((r) => !r.ok)
      .slice(0, 5)
      .map((r) => `• ${r.player.pubgNick}: ${r.error}`)
      .join('\n');

    const extra = failLines ? `\n\n⚠️ Falhas:\n${failLines}` : '';
    return interaction.editReply(`✅ Sync finalizado. Temporada: **${result.seasonId}** | Modo: **${result.gameMode}** | Atualizados: **${ok}** | Falhas: **${fail}**${extra}`);
  }

  if (sub === 'configurar-canal') {
    const channel = interaction.options.getChannel('canal', true);
    await prisma.guildConfig.upsert({
      where: { guildId },
      update: { rankingChannelId: channel.id },
      create: { guildId, rankingChannelId: channel.id }
    });
    return interaction.reply({ content: `✅ Canal de ranking configurado: ${channel}`, ephemeral: true });
  }

  if (sub === 'configurar-modo') {
    const mode = interaction.options.getString('modo', true);
    await prisma.guildConfig.upsert({
      where: { guildId },
      update: { gameMode: mode },
      create: { guildId, gameMode: mode }
    });
    return interaction.reply({ content: `✅ Modo padrão configurado: **${mode}**`, ephemeral: true });
  }
}

async function handleRank(interaction) {
  const order = interaction.options.getString('ordem') || 'score';
  const limit = interaction.options.getInteger('limite') || 10;
  const ranking = await getRanking(interaction.guildId, order, limit);
  if (!ranking.length) return interaction.reply('Nenhum ranking ainda. Peça para um admin usar `/admin cadastrar` e depois `/admin sync`.');

  const lines = ranking.map((row, i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const stat = order === 'damage' || order === 'longestKill' ? num(row[order]) : int(row[order]);
    return `${medal} <@${row.player.discordId}> — **${int(row.score)} pts** | ${order}: **${stat}**`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Ranking Interno PUBG')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Use /admin sync para atualizar os dados.' })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}

async function handlePerfil(interaction) {
  const user = interaction.options.getUser('usuario') || interaction.user;
  const player = await getPlayerStatsByDiscord(interaction.guildId, user.id);
  if (!player) return interaction.reply(`❌ ${user} não está cadastrado no ranking.`);
  const s = player.stats;
  if (!s) return interaction.reply(`⚠️ ${user} está cadastrado, mas ainda não tem stats. Peça para um admin usar /admin sync.`);

  const embed = new EmbedBuilder()
    .setTitle(`🎖️ Perfil PUBG — ${player.pubgNick}`)
    .setDescription(`${user}\n${getRankName(s.score)}`)
    .addFields(
      { name: 'Score', value: int(s.score), inline: true },
      { name: 'Kills', value: int(s.kills), inline: true },
      { name: 'K/D', value: kd(s.kills, s.deaths), inline: true },
      { name: 'Dano', value: num(s.damage), inline: true },
      { name: 'Wins', value: int(s.wins), inline: true },
      { name: 'Top 10', value: int(s.top10s), inline: true },
      { name: 'Assists', value: int(s.assists), inline: true },
      { name: 'Revives', value: int(s.revives), inline: true },
      { name: 'Longest Kill', value: `${num(s.longestKill)}m`, inline: true }
    )
    .setFooter({ text: `Modo: ${s.gameMode} | Season: ${s.seasonId || 'N/A'}` })
    .setTimestamp(s.updatedAt);
  return interaction.reply({ embeds: [embed] });
}

async function handleMvp(interaction) {
  const row = await getMvp(interaction.guildId);
  if (!row) return interaction.reply('Ainda não existe MVP. Rode `/admin sync` primeiro.');
  return interaction.reply(`🏆 MVP atual: <@${row.player.discordId}> — **${row.player.pubgNick}** com **${int(row.score)} pts**.`);
}

async function handleDrop(interaction) {
  const map = interaction.options.getString('mapa') || 'erangel';
  const drops = {
    erangel: ['Pochinki', 'School', 'Military Base', 'Georgopol', 'Rozhok', 'Yasnaya Polyana'],
    miramar: ['Pecado', 'Hacienda', 'Los Leones', 'San Martin', 'El Pozo', 'Power Grid'],
    taego: ['Terminal', 'Palace', 'Shipyard', 'Airport', 'Wol Song', 'Ho San'],
    vikendi: ['Castle', 'Cosmodrome', 'Dino Park', 'Volnova', 'Goroka', 'Dobro Mesto'],
    sanhok: ['Bootcamp', 'Paradise Resort', 'Ruins', 'Pai Nan', 'Camp Alpha', 'Quarry']
  };
  const list = drops[map] || drops.erangel;
  const pick = list[Math.floor(Math.random() * list.length)];
  return interaction.reply(`🪂 Drop sorteado em **${map.toUpperCase()}**: **${pick}**. Sem choro.`);
}


async function handleChave(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🗝️ Mapas de Chaves Secretas / Salas Secretas')
    .setDescription('Selecione um mapa abaixo para ver a imagem com as posições das chaves, salas ou security rooms.')
    .setFooter({ text: 'Dica: em TPP squad, combine esse comando com /drop antes de cair.' })
    .setTimestamp();

  return interaction.reply({ embeds: [embed], components: [buildSecretKeySelectRow()] });
}

async function handleChaveSelect(interaction) {
  const selectedMap = interaction.values?.[0] || 'erangel';
  return interaction.update(buildSecretKeyMapPayload(selectedMap));
}

async function handleDesafio(interaction) {
  const desafios = [
    'Ganhar top 10 sem usar carro.',
    'Cada jogador precisa fazer pelo menos 1 revive.',
    'Só vale rushar depois de usar smoke.',
    'O squad precisa cair em hot drop.',
    'Uma kill obrigatória de granada ou molotov.',
    'O MVP da partida escolhe o próximo drop.',
    'Proibido usar sniper nesta partida.',
    'Quem morrer primeiro paga o drop da próxima.'
  ];
  const pick = desafios[Math.floor(Math.random() * desafios.length)];
  return interaction.reply(`🎲 Desafio do squad: **${pick}**`);
}
