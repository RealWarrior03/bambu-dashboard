export interface FilamentPreset {
  type: string;
  /** Bambu filament profile id for the generic variant */
  infoIdx: string;
  nozzleMin: number;
  nozzleMax: number;
}

/** Generic filament profiles that every Bambu printer knows. */
export const FILAMENT_PRESETS: FilamentPreset[] = [
  { type: 'PLA', infoIdx: 'GFL99', nozzleMin: 190, nozzleMax: 230 },
  { type: 'PLA-CF', infoIdx: 'GFL98', nozzleMin: 210, nozzleMax: 240 },
  { type: 'PETG', infoIdx: 'GFG99', nozzleMin: 220, nozzleMax: 260 },
  { type: 'ABS', infoIdx: 'GFB99', nozzleMin: 240, nozzleMax: 270 },
  { type: 'ASA', infoIdx: 'GFB98', nozzleMin: 240, nozzleMax: 270 },
  { type: 'TPU', infoIdx: 'GFU99', nozzleMin: 200, nozzleMax: 250 },
  { type: 'PA', infoIdx: 'GFN99', nozzleMin: 260, nozzleMax: 290 },
  { type: 'PC', infoIdx: 'GFC99', nozzleMin: 260, nozzleMax: 290 },
  { type: 'PVA', infoIdx: 'GFS99', nozzleMin: 190, nozzleMax: 210 },
];

export const COLOR_SWATCHES = [
  'FFFFFF',
  '000000',
  '8E9089',
  'C12E1F',
  'F4A925',
  'FEC600',
  '00AE42',
  '0A2989',
  '5E43B7',
  'F5547C',
  '7D6556',
  'A3D8E1',
];

/** Normalises user input to RRGGBBAA as expected by the printer. */
export function normalizeColor(color: string): string {
  const hex = color.replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(hex)) return `${hex}FF`;
  if (/^[0-9A-F]{8}$/.test(hex)) return hex;
  throw new Error(`Invalid color: ${color}`);
}
