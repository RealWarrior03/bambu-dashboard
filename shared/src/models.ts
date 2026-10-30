import type { PrinterModel } from './types';

export interface ModelProfile {
  model: PrinterModel;
  label: string;
  /** How the built-in camera is accessed */
  camera: 'jpeg' | 'rtsp';
  fans: { part: boolean; aux: boolean; chamber: boolean };
  maxNozzle: number;
  maxBed: number;
  hasChamberTemp: boolean;
  /** Number of external spool holders (virtual trays) */
  externalSlots: number;
  defaultAms: 'ams' | 'ams_lite';
}

export const MODEL_PROFILES: Record<PrinterModel, ModelProfile> = {
  A1M: {
    model: 'A1M',
    label: 'A1 mini',
    camera: 'jpeg',
    fans: { part: true, aux: false, chamber: false },
    maxNozzle: 300,
    maxBed: 80,
    hasChamberTemp: false,
    externalSlots: 1,
    defaultAms: 'ams_lite',
  },
  A1: {
    model: 'A1',
    label: 'A1',
    camera: 'jpeg',
    fans: { part: true, aux: false, chamber: false },
    maxNozzle: 300,
    maxBed: 100,
    hasChamberTemp: false,
    externalSlots: 1,
    defaultAms: 'ams_lite',
  },
  P1P: {
    model: 'P1P',
    label: 'P1P',
    camera: 'jpeg',
    fans: { part: true, aux: true, chamber: false },
    maxNozzle: 300,
    maxBed: 100,
    hasChamberTemp: false,
    externalSlots: 1,
    defaultAms: 'ams',
  },
  P1S: {
    model: 'P1S',
    label: 'P1S',
    camera: 'jpeg',
    fans: { part: true, aux: true, chamber: true },
    maxNozzle: 300,
    maxBed: 100,
    hasChamberTemp: false,
    externalSlots: 1,
    defaultAms: 'ams',
  },
  P2S: {
    model: 'P2S',
    label: 'P2S',
    camera: 'rtsp',
    fans: { part: true, aux: true, chamber: true },
    maxNozzle: 300,
    maxBed: 110,
    hasChamberTemp: true,
    externalSlots: 1,
    defaultAms: 'ams',
  },
  X1C: {
    model: 'X1C',
    label: 'X1 Carbon',
    camera: 'rtsp',
    fans: { part: true, aux: true, chamber: true },
    maxNozzle: 300,
    maxBed: 110,
    hasChamberTemp: true,
    externalSlots: 1,
    defaultAms: 'ams',
  },
  X1E: {
    model: 'X1E',
    label: 'X1E',
    camera: 'rtsp',
    fans: { part: true, aux: true, chamber: true },
    maxNozzle: 320,
    maxBed: 120,
    hasChamberTemp: true,
    externalSlots: 1,
    defaultAms: 'ams',
  },
  H2D: {
    model: 'H2D',
    label: 'H2D',
    camera: 'rtsp',
    fans: { part: true, aux: true, chamber: true },
    maxNozzle: 350,
    maxBed: 120,
    hasChamberTemp: true,
    externalSlots: 2,
    defaultAms: 'ams',
  },
};

export const PRINTER_MODELS = Object.keys(MODEL_PROFILES) as PrinterModel[];

/** Serial number prefixes as printed on Bambu Lab printers. */
const SERIAL_PREFIXES: [string, PrinterModel][] = [
  ['00M', 'X1C'],
  ['00W', 'X1C'],
  ['03W', 'X1E'],
  ['01S', 'P1P'],
  ['01P', 'P1S'],
  ['030', 'A1M'],
  ['039', 'A1'],
  ['094', 'H2D'],
  ['22E', 'P2S'],
];

export function detectModel(serial: string): PrinterModel | null {
  const s = serial.trim().toUpperCase();
  for (const [prefix, model] of SERIAL_PREFIXES) {
    if (s.startsWith(prefix)) return model;
  }
  return null;
}

export function profileFor(model: PrinterModel): ModelProfile {
  return MODEL_PROFILES[model] ?? MODEL_PROFILES.X1C;
}
