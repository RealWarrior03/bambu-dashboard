import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { registerAuth } from './auth';
import { CameraHub } from './camera/hub';
import { createSource } from './camera/sources';
import { ConfigStore, env } from './config';
import { MOCK_HOST } from './printer/mock';
import { PrinterManager } from './printer/manager';
import { cameraRoutes } from './routes/camera';
import { printerRoutes } from './routes/printers';
import { registerWebSocket } from './ws';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

if (!env.adminPassword) {
  app.log.error('ADMIN_PASSWORD is not set. Nobody will be able to log in.');
}
if (env.sessionSecretGenerated) {
  app.log.warn('SESSION_SECRET is not set. Using a random secret, sessions end on restart.');
}

const store = new ConfigStore(env.dataDir);
await store.load();

if (env.mockPrinters && store.list().length === 0) {
  app.log.info('MOCK_PRINTERS enabled: adding simulated printers');
  await store.create({
    name: 'Werkbank A1',
    host: MOCK_HOST,
    serial: '039MOCK0000001',
    model: 'A1',
    camera: { mode: 'printer' },
  });
  await store.create({
    name: 'Keller X1C',
    host: MOCK_HOST,
    serial: '00MMOCK0000002',
    model: 'X1C',
    camera: { mode: 'printer' },
  });
}

const manager = new PrinterManager();
const hub = new CameraHub((id) => {
  const printer = store.get(id);
  return printer ? createSource(printer) : null;
});

await manager.sync(store.list());
store.on('change', (printers) => {
  hub.resetAll();
  manager.sync(printers).catch((err) => app.log.error(err));
});

await registerAuth(app);
await registerWebSocket(app, { store, manager });
await app.register(printerRoutes, { store, manager });
await app.register(cameraRoutes, { hub });
app.get('/api/health', async () => ({ ok: true }));

const here = dirname(fileURLToPath(import.meta.url));
const webDist = env.webDist ? resolve(env.webDist) : join(here, '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });
} else {
  app.log.info(`No web build at ${webDist}, serving API only (use the Vite dev server).`);
}

const shutdown = async () => {
  hub.resetAll();
  await manager.stopAll();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.port, host: env.host });
