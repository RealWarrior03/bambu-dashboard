import { normalizeColor, type ModelProfile, type PrinterCommand } from '@bambu/shared';

export type MqttPayload = Record<string, any>;

const FAN_INDEX = { part: 1, aux: 2, chamber: 3 } as const;

export class CommandError extends Error {}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

function gcode(line: string): MqttPayload {
  return { print: { command: 'gcode_line', param: `${line}\n` } };
}

/** Translates a dashboard command into the MQTT payload(s) the printer understands. */
export function buildPayloads(cmd: PrinterCommand, profile: ModelProfile): MqttPayload[] {
  switch (cmd.type) {
    case 'light':
      return [
        {
          system: {
            command: 'ledctrl',
            led_node: 'chamber_light',
            led_mode: cmd.on ? 'on' : 'off',
            led_on_time: 500,
            led_off_time: 500,
            loop_times: 0,
            interval_time: 0,
          },
        },
      ];
    case 'nozzleTemp':
      return [gcode(`M104 S${clamp(cmd.value, 0, profile.maxNozzle)}`)];
    case 'bedTemp':
      return [gcode(`M140 S${clamp(cmd.value, 0, profile.maxBed)}`)];
    case 'fan': {
      if (!profile.fans[cmd.fan]) throw new CommandError(`${profile.label} has no ${cmd.fan} fan`);
      const value = clamp((clamp(cmd.percent, 0, 100) / 100) * 255, 0, 255);
      return [gcode(`M106 P${FAN_INDEX[cmd.fan]} S${value}`)];
    }
    case 'speed':
      return [{ print: { command: 'print_speed', param: String(clamp(cmd.level, 1, 4)) } }];
    case 'pause':
    case 'resume':
    case 'stop':
      return [{ print: { command: cmd.type, param: '' } }];
    case 'filament': {
      if (cmd.nozzleMin > cmd.nozzleMax) throw new CommandError('nozzleMin > nozzleMax');
      return [
        {
          print: {
            command: 'ams_filament_setting',
            ams_id: cmd.amsId,
            tray_id: cmd.trayId,
            slot_id: cmd.trayId,
            tray_info_idx: cmd.infoIdx ?? '',
            tray_color: normalizeColor(cmd.color),
            nozzle_temp_min: clamp(cmd.nozzleMin, 0, profile.maxNozzle),
            nozzle_temp_max: clamp(cmd.nozzleMax, 0, profile.maxNozzle),
            tray_type: cmd.trayType,
          },
        },
      ];
    }
    case 'refresh':
      return [pushAll()];
  }
}

export function pushAll(): MqttPayload {
  return { pushing: { command: 'pushall', version: 1, push_target: 1 } };
}

/** Adds the sequence id the printer expects inside the command object. */
export function withSequence(payload: MqttPayload, seq: number): MqttPayload {
  const [key] = Object.keys(payload);
  return { [key]: { sequence_id: String(seq), ...payload[key] } };
}
