import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';
import { profileFor } from '@bambu/shared';
import type { PrinterConfig } from '../config';
import { MOCK_HOST } from '../printer/mock';
import { BambuFrameParser, MjpegSplitter, bambuAuthPacket } from './parsers';

export interface CameraSource extends EventEmitter<{ frame: [Buffer]; error: [Error] }> {
  start(): void;
  stop(): void;
}

const RETRY_MS = 3_000;

/** A1/P1 camera: TLS socket on port 6000 delivering JPEG frames. */
export class BambuJpegSource
  extends EventEmitter<{ frame: [Buffer]; error: [Error] }>
  implements CameraSource
{
  private socket?: tls.TLSSocket;
  private retry?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly host: string,
    private readonly accessCode: string,
  ) {
    super();
  }

  start(): void {
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.retry);
    this.socket?.destroy();
  }

  private connect(): void {
    const parser = new BambuFrameParser();
    const socket = tls.connect({ host: this.host, port: 6000, rejectUnauthorized: false });
    this.socket = socket;
    socket.setTimeout(15_000, () => socket.destroy(new Error('camera timeout')));
    socket.on('secureConnect', () => socket.write(bambuAuthPacket(this.accessCode)));
    socket.on('data', (chunk: Buffer) => {
      for (const frame of parser.push(chunk)) this.emit('frame', frame);
    });
    socket.on('error', (err) => this.emit('error', err));
    socket.on('close', () => {
      if (this.running) this.retry = setTimeout(() => this.connect(), RETRY_MS);
    });
  }
}

/** Any input ffmpeg can read (RTSP/RTSPS, test pattern), re-encoded to MJPEG. */
export class FfmpegSource
  extends EventEmitter<{ frame: [Buffer]; error: [Error] }>
  implements CameraSource
{
  private proc?: ChildProcess;
  private retry?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly inputArgs: string[]) {
    super();
  }

  start(): void {
    this.running = true;
    this.spawn();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.retry);
    this.proc?.kill('SIGKILL');
  }

  private spawn(): void {
    const splitter = new MjpegSplitter();
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      ...this.inputArgs,
      '-an',
      '-vf',
      "scale='min(1280,iw)':-2",
      '-r',
      '10',
      '-q:v',
      '6',
      '-f',
      'mjpeg',
      'pipe:1',
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    let stderr = '';
    proc.stdout!.on('data', (chunk: Buffer) => {
      for (const frame of splitter.push(chunk)) this.emit('frame', frame);
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      this.emit('error', err.code === 'ENOENT' ? new Error('ffmpeg not installed') : err);
    });
    proc.on('exit', (code) => {
      if (code && stderr) this.emit('error', new Error(stderr.trim().split('\n').pop()));
      if (this.running) this.retry = setTimeout(() => this.spawn(), RETRY_MS);
    });
  }
}

export function rtspInput(url: string): string[] {
  return ['-rtsp_transport', 'tcp', '-timeout', '10000000', '-i', url];
}

export function createSource(printer: PrinterConfig): CameraSource | null {
  const { camera } = printer;
  if (camera.mode === 'none') return null;
  if (camera.mode === 'rtsp') {
    return camera.rtspUrl ? new FfmpegSource(rtspInput(camera.rtspUrl)) : null;
  }
  if (printer.host === MOCK_HOST) {
    return new FfmpegSource(['-re', '-f', 'lavfi', '-i', `testsrc2=size=960x540:rate=10`]);
  }
  if (profileFor(printer.model).camera === 'jpeg') {
    return new BambuJpegSource(printer.host, printer.accessCode);
  }
  const code = encodeURIComponent(printer.accessCode);
  return new FfmpegSource(rtspInput(`rtsps://bblp:${code}@${printer.host}:322/streaming/live/1`));
}
