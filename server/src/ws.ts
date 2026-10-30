import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { PrinterStatus, ServerMessage } from '@bambu/shared';
import type { ConfigStore } from './config';
import type { PrinterManager } from './printer/manager';

/** Status updates per printer are sent at most this often. */
const THROTTLE_MS = 500;

export async function registerWebSocket(
  app: FastifyInstance,
  { store, manager }: { store: ConfigStore; manager: PrinterManager },
): Promise<void> {
  await app.register(websocket);
  const clients = new Set<WebSocket>();

  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  };

  const pending = new Map<string, PrinterStatus>();
  const timers = new Map<string, NodeJS.Timeout>();
  manager.on('status', (id, status) => {
    pending.set(id, status);
    if (timers.has(id)) return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        const latest = pending.get(id);
        pending.delete(id);
        if (latest) broadcast({ type: 'status', id, status: latest });
      }, THROTTLE_MS),
    );
  });

  store.on('change', () => broadcast({ type: 'printers' }));

  app.get('/api/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.send(
      JSON.stringify({ type: 'snapshot', statuses: manager.statuses() } satisfies ServerMessage),
    );
    socket.on('close', () => clients.delete(socket));
  });
}
