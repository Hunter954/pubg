# PUBG Ranking Bot — Discord + Railway + PostgreSQL

Bot de ranking interno para comunidades PUBG no Discord.

## O que já vem pronto

- Cadastro de jogador por admin: `/admin cadastrar @usuario nick_pubg`
- Busca do player na API oficial PUBG e salva `pubg_account_id`
- Sync manual: `/admin sync`
- Sync automático a cada 1 hora
- Ranking: `/rank`
- Perfil: `/perfil @usuario`
- MVP: `/mvp`
- Drop aleatório: `/drop`
- Desafio do squad: `/desafio`
- PostgreSQL com Prisma
- Healthcheck `/health` para Railway
- Deploy pronto para GitHub + Railway

## Stack

- Node.js 22+
- discord.js v14
- Prisma ORM
- PostgreSQL
- Railway

## 1. Criar o bot no Discord Developer Portal

1. Crie uma Application.
2. Vá em **Bot** e crie o bot.
3. Copie o token para `DISCORD_TOKEN`.
4. Vá em **OAuth2 > URL Generator**.
5. Marque `bot` e `applications.commands`.
6. Permissões recomendadas:
   - Send Messages
   - Use Slash Commands
   - Manage Roles, se quiser cargos automáticos
   - Read Message History

## 2. Variáveis de ambiente

Copie `.env.example` para `.env` no local:

```env
DISCORD_TOKEN=cole_o_token_do_bot
DISCORD_CLIENT_ID=cole_o_application_client_id
DISCORD_GUILD_ID=opcional_para_registrar_comandos_so_no_servidor
ADMIN_ROLE_ID=opcional_cargo_admin_que_pode_usar_admin
PUBG_API_KEY=cole_sua_api_key_pubg
PUBG_SHARD=steam
PUBG_GAME_MODE=squad-fpp
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
PORT=3000
```

No Railway, configure essas mesmas variáveis na aba **Variables**.

## 3. Rodar local

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run deploy:commands
npm run dev
```

## 4. Deploy no Railway

1. Suba este projeto para um repositório no GitHub.
2. No Railway, crie um novo projeto usando **Deploy from GitHub repo**.
3. Adicione um serviço **PostgreSQL** no mesmo projeto.
4. No serviço do bot, configure:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
PUBG_API_KEY=...
PUBG_SHARD=steam
PUBG_GAME_MODE=squad-fpp
```

5. Faça deploy.
6. Depois do primeiro deploy, rode localmente ou no Railway Shell:

```bash
npm run deploy:commands
```

Se você colocou `DISCORD_GUILD_ID`, os comandos aparecem quase na hora no seu servidor. Sem `DISCORD_GUILD_ID`, os comandos são globais e podem demorar.

## 5. Primeiros comandos no Discord

```txt
/admin cadastrar @Tiago xxXCapitaNXxx
/admin sync
/rank
/perfil @Tiago
/mvp
/drop
/desafio
```

## 6. Score interno

```txt
Score = kills * 10
+ assists * 5
+ damage / 100
+ wins * 60
+ top10s * 15
+ revives * 4
+ longestKill / 20
- teamKills * 30
```

## 7. Cargos automáticos opcionais

Crie cargos no Discord e coloque os IDs nas variáveis:

```env
ROLE_BRONZE_ID=
ROLE_PRATA_ID=
ROLE_OURO_ID=
ROLE_LENDA_ID=
```

Faixas:

- Bronze: 0 a 499
- Prata: 500 a 999
- Ouro: 1000 a 1999
- Lenda: 2000+

## Observações importantes

- O MVP usa stats de temporada por modo, exemplo `squad-fpp`.
- Ranking semanal/mensal avançado por diferença de snapshots pode ser adicionado na V2.
- Telemetry detalhada, como arma da kill, distância real de cada kill, revive por evento e primeiro a morrer, fica para V3.
- A API da PUBG tem rate limit, então o sync tem delay entre jogadores.

## Estrutura

```txt
src/
  commands/
  services/
  jobs/
  utils/
  index.js
prisma/
  schema.prisma
railway.json
```
