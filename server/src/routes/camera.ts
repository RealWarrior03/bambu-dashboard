import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CameraHub } from '../camera/hub';
import { FfmpegSource, rtspInput } from '../camera/sources';

const BOUNDARY = 'frame';
/** Skip frames for slow clients instead of buffering without limit. */
const MAX_BUFFERED = 2 * 1024 * 1024;

export async function cameraRoutes(
  app: FastifyInstance,
  { hub }: { hub: CameraHub },
): Promise<void> {
  app.get<{ Params: { id: string } }>('/api/printers/:id/camera.mjpeg', (req, reply) => {
    const res = reply.raw;
    const write = (frame: Buffer) => {
      if (res.writableLength > MAX_BUFFERED) return;
      res.write(
        `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
      );
      res.write(frame);
      res.write('\r\n');
    };
    // The hub may deliver a cached frame synchronously, before the headers are written.
    let headersSent = false;
    let early: Buffer | undefined;
    const unsubscribe = hub.subscribe(req.params.id, (frame) => {
      if (headersSent) write(frame);
      else early = frame;
    });
    if (!unsubscribe) {
      reply.code(404).send({ error: 'camera_disabled' });
      return;
    }
    reply.hijack();
    res.writeHead(200, {
      'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'close',
    });
    headersSent = true;
    if (early) write(early);
    req.raw.on('close', unsubscribe);
  });

  app.get<{ Params: { id: string } }>('/api/printers/:id/camera.jpg', async (req, reply) => {
    try {
      const frame = await hub.snapshot(req.params.id);
      return reply.type('image/jpeg').header('Cache-Control', 'no-store').send(frame);
    } catch (err: any) {
      const status = err.message === 'camera_disabled' ? 404 : 504;
      return reply.code(status).send({ error: err.message });
    }
  });

  /** Grabs one frame from an RTSP URL that has not been saved yet. */
  app.post('/api/camera/test', async (req, reply) => {
    const body = z.object({ rtspUrl: z.string().regex(/^rtsps?:\/\//i) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const source = new FfmpegSource(rtspInput(body.data.rtspUrl));
    try {
      const frame = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('camera_timeout')), 15_000);
        source.once('frame', (f) => {
          clearTimeout(timer);
          resolve(f);
        });
        source.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        source.start();
      });
      return reply.type('image/jpeg').header('Cache-Control', 'no-store').send(frame);
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    } finally {
      source.stop();
    }
  });
}
