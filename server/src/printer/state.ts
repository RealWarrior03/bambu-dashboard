import {
  EXTERNAL_AMS_ID,
  profileFor,
  type AmsKind,
  type AmsUnit,
  type ConnectionState,
  type HmsError,
  type JobState,
  type PrinterModel,
  type PrinterStatus,
  type Tray,
} from '@bambu/shared';

type Raw = Record<string, any>;

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merges a report from the printer into the accumulated state.
 * P1/A1 printers only send changed fields, so the full picture has to be built up over time.
 * Arrays of objects with an "id" field (AMS units, trays) are merged by id, other arrays are replaced.
 */
export function mergeReport(target: Raw, patch: Raw): Raw {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key];
    if (isObject(value) && isObject(current)) {
      mergeReport(current, value);
    } else if (Array.isArray(value) && Array.isArray(current) && value.every(hasId)) {
      target[key] = value.map((item) => {
        const existing = current.find((c) => hasId(c) && c.id === item.id);
        return existing ? mergeReport(structuredClone(existing), item) : structuredClone(item);
      });
    } else {
      target[key] = structuredClone(value);
    }
  }
  return target;
}

function hasId(v: unknown): v is Raw & { id: unknown } {
  return isObject(v) && 'id' in v;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** Fan speeds are reported as 0-15. */
function fanPercent(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round((Math.min(15, Math.max(0, n)) / 15) * 100);
}

const JOB_STATES: JobState[] = ['IDLE', 'PREPARE', 'RUNNING', 'PAUSE', 'FINISH', 'FAILED'];

function jobState(v: unknown): JobState {
  const s = String(v ?? '').toUpperCase();
  if (s === 'SLICING') return 'PREPARE';
  return (JOB_STATES as string[]).includes(s) ? (s as JobState) : 'UNKNOWN';
}

function parseTray(t: Raw, amsId: number): Tray {
  const trayId = Number(t.id);
  const type = String(t.tray_type ?? '');
  const remain = num(t.remain);
  return {
    key: `${amsId}:${trayId}`,
    amsId,
    trayId,
    type,
    color: String(t.tray_color ?? '').toUpperCase(),
    name: t.tray_sub_brands || undefined,
    infoIdx: t.tray_info_idx || undefined,
    remain: remain !== null && remain >= 0 ? remain : null,
    nozzleMin: num(t.nozzle_temp_min),
    nozzleMax: num(t.nozzle_temp_max),
    empty: type === '',
  };
}

function amsKind(unitId: number, model: PrinterModel): AmsKind {
  if (unitId >= 128) return 'ams_ht';
  return profileFor(model).defaultAms;
}

function parseAms(print: Raw, model: PrinterModel): AmsUnit[] {
  const units: Raw[] = Array.isArray(print.ams?.ams) ? print.ams.ams : [];
  return units.map((u) => {
    const id = Number(u.id);
    const trays: Raw[] = Array.isArray(u.tray) ? u.tray : [];
    return {
      id,
      kind: amsKind(id, model),
      humidityPercent: num(u.humidity_raw),
      humidityLevel: num(u.humidity),
      temperature: round1(num(u.temp)),
      trays: trays.map((t) => parseTray(t, id)),
    };
  });
}

function parseExternal(print: Raw): Tray[] {
  if (Array.isArray(print.vir_slot) && print.vir_slot.length > 0) {
    return print.vir_slot.map((t: Raw) => parseTray(t, EXTERNAL_AMS_ID));
  }
  if (isObject(print.vt_tray)) {
    return [parseTray({ id: 254, ...print.vt_tray }, EXTERNAL_AMS_ID)];
  }
  return [];
}

function activeTray(print: Raw): string | null {
  const now = num(print.ams?.tray_now);
  if (now === null || now === 255) return null;
  if (now === 254) return `${EXTERNAL_AMS_ID}:254`;
  if (now >= 128) return `${now}:0`; // AMS HT has a single slot per unit
  return `${Math.floor(now / 4)}:${now % 4}`;
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

function parseHms(print: Raw): HmsError[] {
  const list: Raw[] = Array.isArray(print.hms) ? print.hms : [];
  return list.map((h) => {
    const attr = Number(h.attr) >>> 0;
    const code = Number(h.code) >>> 0;
    return {
      attr,
      rawCode: code,
      code: `${hex4(attr >>> 16)}_${hex4(attr & 0xffff)}_${hex4(code >>> 16)}_${hex4(code & 0xffff)}`,
    };
  });
}

function lightState(print: Raw): boolean | null {
  const lights: Raw[] = Array.isArray(print.lights_report) ? print.lights_report : [];
  const chamber = lights.find((l) => l.node === 'chamber_light');
  return chamber ? chamber.mode !== 'off' : null;
}

export function deriveStatus(
  raw: Raw,
  model: PrinterModel,
  connection: ConnectionState,
  connectionError?: string,
): PrinterStatus {
  const p: Raw = raw.print ?? {};
  const layer = num(p.layer_num);
  const totalLayers = num(p.total_layer_num);
  return {
    connection,
    connectionError,
    job: jobState(p.gcode_state),
    progress: num(p.mc_percent) ?? 0,
    remainingMinutes: num(p.mc_remaining_time),
    layer,
    totalLayers: totalLayers || null,
    fileName: String(p.subtask_name || p.gcode_file || ''),
    nozzleTemp: round1(num(p.nozzle_temper)),
    nozzleTarget: round1(num(p.nozzle_target_temper)),
    bedTemp: round1(num(p.bed_temper)),
    bedTarget: round1(num(p.bed_target_temper)),
    chamberTemp: profileFor(model).hasChamberTemp ? round1(num(p.chamber_temper)) : null,
    fans: {
      part: fanPercent(p.cooling_fan_speed),
      aux: fanPercent(p.big_fan1_speed),
      chamber: fanPercent(p.big_fan2_speed),
    },
    speedLevel: num(p.spd_lvl),
    light: lightState(p),
    wifiSignal: p.wifi_signal ?? null,
    ams: parseAms(p, model),
    externalTrays: parseExternal(p),
    activeTray: activeTray(p),
    hms: parseHms(p),
    updatedAt: Date.now(),
  };
}
