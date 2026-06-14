import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administração do ranking PUBG')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('cadastrar')
      .setDescription('Cadastra ou atualiza um jogador no ranking')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuário do Discord').setRequired(true))
      .addStringOption((o) => o.setName('nick').setDescription('Nick exato no PUBG').setRequired(true)))
    .addSubcommand((s) => s.setName('remover')
      .setDescription('Remove/desativa um jogador do ranking')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuário do Discord').setRequired(true)))
    .addSubcommand((s) => s.setName('listar')
      .setDescription('Lista jogadores cadastrados'))
    .addSubcommand((s) => s.setName('sync')
      .setDescription('Sincroniza stats dos jogadores com a PUBG API'))
    .addSubcommand((s) => s.setName('configurar-canal')
      .setDescription('Define o canal onde o bot postará ranking')
      .addChannelOption((o) => o.setName('canal').setDescription('Canal de ranking').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('configurar-modo')
      .setDescription('Define o modo padrão de ranking')
      .addStringOption((o) => o.setName('modo').setDescription('Modo PUBG').setRequired(true).addChoices(
        { name: 'Squad FPP', value: 'squad-fpp' },
        { name: 'Squad TPP', value: 'squad' },
        { name: 'Duo FPP', value: 'duo-fpp' },
        { name: 'Duo TPP', value: 'duo' },
        { name: 'Solo FPP', value: 'solo-fpp' },
        { name: 'Solo TPP', value: 'solo' }
      )))
    .addSubcommand((s) => s.setName('fechar-mes')
      .setDescription('Fecha e salva o ranking de um mês')
      .addStringOption((o) => o.setName('periodo').setDescription('Ex: 2026-07 ou julho. Vazio fecha mês anterior.')))
    .addSubcommand((s) => s.setName('recalcular-mes')
      .setDescription('Recalcula e sobrescreve o ranking mensal salvo')
      .addStringOption((o) => o.setName('periodo').setDescription('Ex: 2026-07 ou julho').setRequired(true))),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Mostra o ranking interno PUBG')
    .addStringOption((o) => o.setName('ordem').setDescription('Ordenar por').addChoices(
      { name: 'Score', value: 'score' },
      { name: 'Kills', value: 'kills' },
      { name: 'Dano', value: 'damage' },
      { name: 'Wins', value: 'wins' },
      { name: 'Assists', value: 'assists' },
      { name: 'Revives', value: 'revives' },
      { name: 'Longest Kill', value: 'longestKill' }
    ))
    .addIntegerOption((o) => o.setName('limite').setDescription('Quantidade de jogadores, até 25')),

  new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Mostra o perfil PUBG de um jogador')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário do Discord')),


  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra ranking mensal atual ou histórico')
    .addStringOption((o) => o.setName('periodo').setDescription('Ex: julho ou 2026-07. Vazio mostra o mês atual.'))
    .addStringOption((o) => o.setName('categoria').setDescription('Categoria').addChoices(
      { name: 'Score', value: 'score' },
      { name: 'Kills', value: 'kills' },
      { name: 'Dano', value: 'damage' },
      { name: 'Wins', value: 'wins' },
      { name: 'Headshots', value: 'headshotKills' },
      { name: 'Revives', value: 'revives' },
      { name: 'DBNOs / Knocks', value: 'dbnos' },
      { name: 'Longest Kill', value: 'longestKill' },
      { name: 'Team Kills', value: 'teamKills' }
    ))
    .addIntegerOption((o) => o.setName('limite').setDescription('Quantidade de jogadores, até 25')),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Ranking por categoria')
    .addStringOption((o) => o.setName('categoria').setDescription('Categoria').setRequired(true).addChoices(
      { name: 'Kills', value: 'kills' },
      { name: 'Dano', value: 'damage' },
      { name: 'Wins', value: 'wins' },
      { name: 'Headshots', value: 'headshotKills' },
      { name: 'Revives', value: 'revives' },
      { name: 'DBNOs / Knocks', value: 'dbnos' },
      { name: 'Longest Kill', value: 'longestKill' },
      { name: 'Team Kills', value: 'teamKills' }
    ))
    .addIntegerOption((o) => o.setName('limite').setDescription('Quantidade de jogadores, até 25')),

  new SlashCommandBuilder()
    .setName('evolucao')
    .setDescription('Mostra evolução do jogador nos últimos dias')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário do Discord'))
    .addIntegerOption((o) => o.setName('dias').setDescription('Quantidade de dias. Padrão: 7')),

  new SlashCommandBuilder()
    .setName('timeline')
    .setDescription('Mostra uma timeline da última partida recente do squad')
    .addIntegerOption((o) => o.setName('limite').setDescription('Quantidade de eventos, até 25')),

  new SlashCommandBuilder()
    .setName('mvp')
    .setDescription('Mostra o MVP atual do servidor'),

  new SlashCommandBuilder()
    .setName('drop')
    .setDescription('Sorteia um drop para a próxima partida')
    .addStringOption((o) => o.setName('mapa').setDescription('Mapa').addChoices(
      { name: 'Erangel', value: 'erangel' },
      { name: 'Miramar', value: 'miramar' },
      { name: 'Taego', value: 'taego' },
      { name: 'Vikendi', value: 'vikendi' },
      { name: 'Sanhok', value: 'sanhok' }
    )),

  new SlashCommandBuilder()
    .setName('desafio')
    .setDescription('Sorteia um desafio interno para o squad')
].map((command) => command.toJSON());
