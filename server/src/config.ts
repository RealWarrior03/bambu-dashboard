import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CameraSettings, PrinterInfo, PrinterInput, PrinterModel } from '@bambu/shared';

function bool(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').toLowerCase());
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  sessionSecretGenerated: !process.env.SESSION_SECRET,
  cookieSecure: bool(process.env.COOKIE_SECURE),
  mockPrinters: bool(process.env.MOCK_PRINTERS),
  webDist: process.env.WEB_DIST,
};

export interface PrinterConfig {
  id: string;
  name: string;
  host: string;
  serial: string;
  accessCode: string;
  model: PrinterModel;
  camera: CameraSettings;
}

interface StoredConfig {
  printers: PrinterConfig[];
}

export function toPrinterInfo(p: PrinterConfig): PrinterInfo {
  return {
    id: p.id,
    name: p.name,
    host: p.host,
    serial: p.serial,
    model: p.model,
    camera: p.camera,
    hasAccessCode: p.accessCode.length > 0,
  };
}

/** Persists printer configuration as JSON in the data directory. */
export class ConfigStore extends EventEmitter<{ change: [PrinterConfig[]] }> {
  private printers: PrinterConfig[] = [];
  private readonly file: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    super();
    this.file = join(dataDir, 'config.json');
  }

  async load(): Promise<void> {
    await mkdir(join(this.file, '..'), { recursive: true });
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as StoredConfig;
      this.printers = data.printers ?? [];
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      this.printers = [];
    }
  }

  list(): PrinterConfig[] {
    return this.printers;
  }

  get(id: string): PrinterConfig | undefined {
    return this.printers.find((p) => p.id === id);
  }

  async create(input: PrinterInput): Promise<PrinterConfig> {
    const printer: PrinterConfig = {
      id: randomUUID(),
      name: input.name,
      host: input.host,
      serial: input.serial.toUpperCase(),
      accessCode: input.accessCode ?? '',
      model: input.model,
      camera: input.camera,
    };
    this.printers = [...this.printers, printer];
    await this.save();
    return printer;
  }

  async update(id: string, input: PrinterInput): Promise<PrinterConfig | undefined> {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updated: PrinterConfig = {
      ...existing,
      name: input.name,
      host: input.host,
      serial: input.serial.toUpperCase(),
      accessCode: input.accessCode ? input.accessCode : existing.accessCode,
      model: input.model,
      camera: input.camera,
    };
    this.printers = this.printers.map((p) => (p.id === id ? updated : p));
    await this.save();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.printers.length;
    this.printers = this.printers.filter((p) => p.id !== id);
    if (this.printers.length === before) return false;
    await this.save();
    return true;
  }

  private save(): Promise<void> {
    const data: StoredConfig = { printers: this.printers };
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tmp, this.file);
    });
    this.emit('change', this.printers);
    return this.writeQueue;
  }
}
