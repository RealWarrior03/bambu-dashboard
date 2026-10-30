import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import { profileFor, type PrinterCommand, type PrinterStatus } from '@bambu/shared';
import type { PrinterConfig } from '../config';
import { buildPayloads, pushAll, withSequence, type MqttPayload } from './commands';
import { deriveStatus, mergeReport } from './state';

export interface PrinterConnection extends EventEmitter<{ status: [PrinterStatus] }> {
  readonly status: PrinterStatus;
  start(): void;
  stop(): Promise<void>;
  send(cmd: PrinterCommand): void;
}

/** P1/A1 printers struggle with frequent full status requests, so they are rate limited. */
const PUSHALL_MIN_INTERVAL_MS = 30_000;

/** Talks to a printer in LAN mode via its built-in MQTT broker. */
export class BambuConnection
  extends EventEmitter<{ status: [PrinterStatus] }>
  implements PrinterConnection
{
  private client?: MqttClient;
  private raw: Record<string, any> = {};
  private seq = 0;
  private lastPushAll = 0;
  status: PrinterStatus;

  constructor(private readonly cfg: PrinterConfig) {
    super();
    this.status = deriveStatus({}, cfg.model, 'connecting');
  }

  start(): void {
    const { host, serial, accessCode } = this.cfg;
    this.client = mqtt.connect(`mqtts://${host}:8883`, {
      username: 'bblp',
      password: accessCode,
      clientId: `bambu-dashboard-${Math.random().toString(16).slice(2, 10)}`,
      rejectUnauthorized: false,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
      keepalive: 30,
    });

    this.client.on('connect', () => {
      this.client!.subscribe(`device/${serial}/report`, (err) => {
        if (err) return this.update('error', err.message);
        this.update('online');
        this.requestFullStatus(true);
      });
    });
    this.client.on('message', (_topic, message) => this.onMessage(message));
    this.client.on('error', (err) => this.update('error', err.message));
    this.client.on('offline', () => this.update('offline'));
    this.client.on('close', () => {
      if (this.status.connection === 'online') this.update('offline');
    });
    this.client.on('reconnect', () => {
      if (this.status.connection !== 'error') this.update('connecting');
    });
  }

  async stop(): Promise<void> {
    await this.client?.endAsync(true);
    this.client = undefined;
  }

  send(cmd: PrinterCommand): void {
    if (cmd.type === 'refresh') {
      this.requestFullStatus(false);
      return;
    }
    for (const payload of buildPayloads(cmd, profileFor(this.cfg.model))) {
      this.publish(payload);
    }
  }

  private requestFullStatus(force: boolean): void {
    if (!force && Date.now() - this.lastPushAll < PUSHALL_MIN_INTERVAL_MS) return;
    this.lastPushAll = Date.now();
    this.publish(pushAll());
  }

  private publish(payload: MqttPayload): void {
    if (!this.client?.connected) throw new Error('printer_offline');
    this.client.publish(
      `device/${this.cfg.serial}/request`,
      JSON.stringify(withSequence(payload, ++this.seq)),
    );
  }

  private onMessage(message: Buffer): void {
    let report: Record<string, any>;
    try {
      report = JSON.parse(message.toString('utf8'));
    } catch {
      return;
    }
    // Only status-bearing sections are kept; command acknowledgements are ignored.
    if (report.print) mergeReport(this.raw, { print: report.print });
    else return;
    this.update('online');
  }

  private update(connection: PrinterStatus['connection'], error?: string): void {
    this.status = deriveStatus(this.raw, this.cfg.model, connection, error);
    this.emit('status', this.status);
  }
}
