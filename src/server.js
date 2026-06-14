import express from 'express';
import { config } from './config.js';

export function startHealthServer() {
  const app = express();
  app.get('/', (_req, res) => res.json({ ok: true, service: 'pubg-ranking-bot' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.listen(config.port, () => console.log(`Healthcheck ativo na porta ${config.port}`));
}
