import { EventEmitter } from 'node:events';
import type { PrinterCommand, PrinterStatus } from '@bambu/shared';
import type { PrinterConfig } from '../config';
import { BambuConnection, type PrinterConnection } from './connection';
import { MOCK_HOST, MockConnection } from './mock';

interface Entry {
  key: string;
  connection: PrinterConnection;
}

/** Keeps one live connection per configured printer. */
export class PrinterManager extends EventEmitter<{ status: [string, PrinterStatus] }> {
  private readonly entries = new Map<string, Entry>();

  async sync(printers: PrinterConfig[]): Promise<void> {
    const wanted = new Map(printers.map((p) => [p.id, p]));

    for (const [id, entry] of this.entries) {
      const cfg = wanted.get(id);
      if (!cfg || connectionKey(cfg) !== entry.key) {
        this.entries.delete(id);
        entry.connection.removeAllListeners();
        await entry.connection.stop();
      }
    }

    for (const cfg of printers) {
      if (this.entries.has(cfg.id)) continue;
      const connection: PrinterConnection =
        cfg.host === MOCK_HOST ? new MockConnection(cfg) : new BambuConnection(cfg);
      connection.on('status', (status) => this.emit('status', cfg.id, status));
      this.entries.set(cfg.id, { key: connectionKey(cfg), connection });
      connection.start();
    }
  }

  statuses(): Record<string, PrinterStatus> {
    return Object.fromEntries(
      [...this.entries].map(([id, entry]) => [id, entry.connection.status]),
    );
  }

  send(id: string, cmd: PrinterCommand): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('unknown_printer');
    entry.connection.send(cmd);
  }

  async stopAll(): Promise<void> {
    await this.sync([]);
  }
}

function connectionKey(p: PrinterConfig): string {
  return JSON.stringify([p.host, p.serial, p.accessCode, p.model]);
}
