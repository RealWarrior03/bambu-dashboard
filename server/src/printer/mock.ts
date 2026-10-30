import { EventEmitter } from 'node:events';
import { profileFor, type PrinterCommand, type PrinterStatus } from '@bambu/shared';
import type { PrinterConfig } from '../config';
import { buildPayloads, type MqttPayload } from './commands';
import type { PrinterConnection } from './connection';
import { deriveStatus, mergeReport } from './state';

export const MOCK_HOST = 'mock';

function tray(id: number, type: string, color: string, remain: number) {
  return {
    id: String(id),
    tray_type: type,
    tray_color: color,
    remain,
    nozzle_temp_min: '190',
    nozzle_temp_max: '230',
    tray_info_idx: 'GFL99',
    tray_sub_brands: type === '' ? '' : `Generic ${type}`,
  };
}

/**
 * Simulated printer for development without hardware.
 * It produces the same raw reports as a real printer and applies the real MQTT payloads,
 * so the parser and the command builder are exercised as well.
 */
export class MockConnection
  extends EventEmitter<{ status: [PrinterStatus] }>
  implements PrinterConnection
{
  private timer?: NodeJS.Timeout;
  private raw: Record<string, any>;
  status: PrinterStatus;

  constructor(private readonly cfg: PrinterConfig) {
    super();
    const profile = profileFor(cfg.model);
    const withAms = profile.camera === 'rtsp';
    this.raw = {
      print: {
        gcode_state: 'RUNNING',
        subtask_name: withAms ? 'Benchy_multicolor' : 'Kabelhalter_v3',
        mc_percent: 12,
        mc_remaining_time: 84,
        layer_num: 30,
        total_layer_num: 250,
        nozzle_temper: 25,
        nozzle_target_temper: 220,
        bed_temper: 25,
        bed_target_temper: 60,
        chamber_temper: 31,
        cooling_fan_speed: '15',
        big_fan1_speed: '0',
        big_fan2_speed: '6',
        spd_lvl: 2,
        wifi_signal: '-52dBm',
        lights_report: [{ node: 'chamber_light', mode: 'on' }],
        hms: [],
        vt_tray: tray(254, withAms ? '' : 'PLA', '00AE42FF', -1),
        ams: withAms
          ? {
              tray_now: '1',
              ams: [
                {
                  id: '0',
                  humidity: '4',
                  humidity_raw: '18',
                  temp: '27.4',
                  tray: [
                    tray(0, 'PLA', 'FFFFFFFF', 80),
                    tray(1, 'PLA', 'C12E1FFF', 45),
                    tray(2, 'PETG', '0A2989FF', 100),
                    tray(3, '', '00000000', -1),
                  ],
                },
                {
                  id: '1',
                  humidity: '2',
                  temp: '26.9',
                  tray: [
                    tray(0, 'PLA', '000000FF', 12),
                    tray(1, 'TPU', 'F4A925FF', 60),
                    tray(2, '', '00000000', -1),
                    tray(3, '', '00000000', -1),
                  ],
                },
              ],
            }
          : { tray_now: '254', ams: [] },
      },
    };
    this.status = deriveStatus(this.raw, cfg.model, 'connecting');
  }

  start(): void {
    setTimeout(() => this.emitStatus(), 300);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
  }

  send(cmd: PrinterCommand): void {
    if (cmd.type === 'refresh') return this.emitStatus();
    for (const payload of buildPayloads(cmd, profileFor(this.cfg.model))) this.apply(payload);
    this.emitStatus();
  }

  private apply(payload: MqttPayload): void {
    const p = this.raw.print;
    if (payload.system?.command === 'ledctrl') {
      p.lights_report = [{ node: 'chamber_light', mode: payload.system.led_mode }];
      return;
    }
    const cmd = payload.print ?? {};
    switch (cmd.command) {
      case 'gcode_line': {
        const [, code, arg1, arg2] =
          /^(M104|M140|M106)\s+(?:P(\d)\s+)?S(\d+)/.exec(cmd.param) ?? [];
        if (code === 'M104') p.nozzle_target_temper = Number(arg2);
        if (code === 'M140') p.bed_target_temper = Number(arg2);
        if (code === 'M106') {
          const key = { '1': 'cooling_fan_speed', '2': 'big_fan1_speed', '3': 'big_fan2_speed' }[
            arg1 as '1' | '2' | '3'
          ];
          if (key) p[key] = String(Math.round((Number(arg2) / 255) * 15));
        }
        break;
      }
      case 'print_speed':
        p.spd_lvl = Number(cmd.param);
        break;
      case 'pause':
        p.gcode_state = 'PAUSE';
        break;
      case 'resume':
        p.gcode_state = 'RUNNING';
        break;
      case 'stop':
        p.gcode_state = 'FAILED';
        p.nozzle_target_temper = 0;
        p.bed_target_temper = 0;
        break;
      case 'ams_filament_setting': {
        const patch = {
          tray_type: cmd.tray_type,
          tray_color: cmd.tray_color,
          nozzle_temp_min: String(cmd.nozzle_temp_min),
          nozzle_temp_max: String(cmd.nozzle_temp_max),
          tray_info_idx: cmd.tray_info_idx,
          tray_sub_brands: `Generic ${cmd.tray_type}`,
        };
        if (cmd.ams_id === 255) mergeReport(p.vt_tray, patch);
        else {
          const unit = p.ams.ams.find((u: any) => Number(u.id) === cmd.ams_id);
          const slot = unit?.tray.find((t: any) => Number(t.id) === cmd.tray_id);
          if (slot) mergeReport(slot, patch);
        }
        break;
      }
    }
  }

  private tick(): void {
    const p = this.raw.print;
    const approach = (cur: number, target: number, step: number) =>
      Math.abs(target - cur) < step ? target : cur + Math.sign(target - cur) * step;
    p.nozzle_temper =
      approach(p.nozzle_temper, Math.max(25, p.nozzle_target_temper), 6) +
      (Math.random() - 0.5) * 0.4;
    p.bed_temper =
      approach(p.bed_temper, Math.max(25, p.bed_target_temper), 1.5) + (Math.random() - 0.5) * 0.2;

    if (p.gcode_state === 'RUNNING' && p.nozzle_temper > p.nozzle_target_temper - 5) {
      const speed = [0, 0.5, 1, 1.5, 2][p.spd_lvl] ?? 1;
      p.mc_percent = Math.min(100, p.mc_percent + 0.1 * speed);
      p.layer_num = Math.round((p.mc_percent / 100) * p.total_layer_num);
      p.mc_remaining_time = Math.round(((100 - p.mc_percent) / 100) * 95);
      if (p.mc_percent >= 100) {
        p.gcode_state = 'FINISH';
        p.nozzle_target_temper = 0;
        p.bed_target_temper = 0;
      }
    } else if (p.gcode_state === 'FINISH' || p.gcode_state === 'FAILED') {
      if (Math.random() < 0.02) {
        Object.assign(p, {
          gcode_state: 'RUNNING',
          mc_percent: 0,
          layer_num: 0,
          nozzle_target_temper: 220,
          bed_target_temper: 60,
        });
      }
    }
    this.emitStatus();
  }

  private emitStatus(): void {
    this.status = deriveStatus(this.raw, this.cfg.model, 'online');
    this.emit('status', this.status);
  }
}
