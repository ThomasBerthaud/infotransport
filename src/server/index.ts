import { resolve } from 'node:path';
import { createApp } from './app.js';
import { log } from './log.js';
import { Service } from './service.js';
import { Store } from './storage.js';

const service = new Service(
  new Store(resolve(process.env.DATA_DIR || 'data')),
  process.env.PRIM_API_KEY || '',
);
await service.init();
const app = createApp(service, { production: process.env.NODE_ENV === 'production' });
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, '0.0.0.0', () => {
  log.info(`InfoTransport : http://localhost:${port} · mode ${service.mode}`);
});
server.on('error', (error) => {
  log.error(`Démarrage impossible : ${error.message}`);
  process.exit(1);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
