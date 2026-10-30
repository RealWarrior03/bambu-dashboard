import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PRINTER_MODELS, type PrinterModel } from '@bambu/shared';
import { toPrinterInfo, type ConfigStore } from '../config';
import { CommandError } from '../printer/commands';
import type { PrinterManager } from '../printer/manager';

const cameraSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('printer') }),
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('rtsp'), rtspUrl: z.string().regex(/^rtsps?:\/\//i) }),
]);

const printerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  host: z.string().trim().min(1).max(255),
  serial: z.string().trim().min(1).max(32),
  accessCode: z.string().trim().max(32).optional(),
  model: z.enum(PRINTER_MODELS as [PrinterModel, ...PrinterModel[]]),
  camera: cameraSchema,
});

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('light'), on: z.boolean() }),
  z.object({ type: z.literal('nozzleTemp'), value: z.number().min(0).max(400) }),
  z.object({ type: z.literal('bedTemp'), value: z.number().min(0).max(150) }),
  z.object({
    type: z.literal('fan'),
    fan: z.enum(['part', 'aux', 'chamber']),
    percent: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal('speed'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('stop') }),
  z.object({
    type: z.literal('filament'),
    amsId: z.number().int().min(0).max(255),
    trayId: z.number().int().min(0).max(255),
    trayType: z.string().trim().min(1).max(16),
    color: z.string().regex(/^#?([0-9a-f]{6}|[0-9a-f]{8})$/i),
    nozzleMin: z.number().int().min(0).max(400),
    nozzleMax: z.number().int().min(0).max(400),
    infoIdx: z.string().max(16).optional(),
  }),
  z.object({ type: z.literal('refresh') }),
]);

export async function printerRoutes(
  app: FastifyInstance,
  { store, manager }: { store: ConfigStore; manager: PrinterManager },
): Promise<void> {
  app.get('/api/printers', async () => store.list().map(toPrinterInfo));

  app.post('/api/printers', async (req, reply) => {
    const body = printerSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_request', issues: body.error.issues });
    if (!body.data.accessCode && body.data.host !== 'mock') {
      return reply.code(400).send({ error: 'access_code_required' });
    }
    return toPrinterInfo(await store.create(body.data));
  });

  app.put<{ Params: { id: string } }>('/api/printers/:id', async (req, reply) => {
    const body = printerSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_request', issues: body.error.issues });
    const updated = await store.update(req.params.id, body.data);
    if (!updated) return reply.code(404).send({ error: 'not_found' });
    return toPrinterInfo(updated);
  });

  app.delete<{ Params: { id: string } }>('/api/printers/:id', async (req, reply) => {
    if (!(await store.remove(req.params.id))) return reply.code(404).send({ error: 'not_found' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/printers/:id/command', async (req, reply) => {
    const body = commandSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'invalid_request', issues: body.error.issues });
    try {
      manager.send(req.params.id, body.data);
      return { ok: true };
    } catch (err: any) {
      if (err.message === 'unknown_printer') return reply.code(404).send({ error: 'not_found' });
      if (err.message === 'printer_offline')
        return reply.code(409).send({ error: 'printer_offline' });
      if (err instanceof CommandError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });
}
