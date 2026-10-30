import type { CameraSource } from './sources';

type Listener = (frame: Buffer) => void;

interface Stream {
  source: CameraSource;
  listeners: Set<Listener>;
  lastFrame?: Buffer;
  lastError?: string;
  idleTimer?: NodeJS.Timeout;
}

/** Keep a source alive briefly after the last viewer leaves, so page switches don't reconnect. */
const IDLE_MS = 20_000;

/**
 * Shares one camera source between all viewers of a printer.
 * Sources only run while someone is watching.
 */
export class CameraHub {
  private readonly streams = new Map<string, Stream>();

  constructor(private readonly factory: (id: string) => CameraSource | null) {}

  subscribe(id: string, listener: Listener): (() => void) | null {
    const stream = this.ensure(id);
    if (!stream) return null;
    clearTimeout(stream.idleTimer);
    stream.listeners.add(listener);
    if (stream.lastFrame) listener(stream.lastFrame);
    return () => {
      stream.listeners.delete(listener);
      if (stream.listeners.size === 0) this.scheduleIdle(id, stream);
    };
  }

  /** Returns the next (or a very recent) frame, starting the source if needed. */
  snapshot(id: string, timeoutMs = 10_000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let unsubscribe: (() => void) | null = null;
      const timer = setTimeout(() => {
        unsubscribe?.();
        reject(new Error(this.streams.get(id)?.lastError ?? 'camera_timeout'));
      }, timeoutMs);
      unsubscribe = this.subscribe(id, (frame) => {
        clearTimeout(timer);
        queueMicrotask(() => unsubscribe?.());
        resolve(frame);
      });
      if (!unsubscribe) {
        clearTimeout(timer);
        reject(new Error('camera_disabled'));
      }
    });
  }

  /** Stops the stream so the next viewer picks up changed settings. */
  reset(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    clearTimeout(stream.idleTimer);
    stream.source.stop();
    this.streams.delete(id);
  }

  resetAll(): void {
    for (const id of [...this.streams.keys()]) this.reset(id);
  }

  private ensure(id: string): Stream | null {
    const existing = this.streams.get(id);
    if (existing) return existing;
    const source = this.factory(id);
    if (!source) return null;
    const stream: Stream = { source, listeners: new Set() };
    source.on('frame', (frame) => {
      stream.lastFrame = frame;
      stream.lastError = undefined;
      for (const l of stream.listeners) l(frame);
    });
    source.on('error', (err) => {
      stream.lastError = err.message;
    });
    this.streams.set(id, stream);
    source.start();
    return stream;
  }

  private scheduleIdle(id: string, stream: Stream): void {
    clearTimeout(stream.idleTimer);
    stream.idleTimer = setTimeout(() => {
      if (stream.listeners.size === 0) this.reset(id);
    }, IDLE_MS);
  }
}
