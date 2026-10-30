export type PrinterModel = 'A1' | 'A1M' | 'P1P' | 'P1S' | 'X1C' | 'X1E' | 'H2D' | 'P2S';

export type CameraMode = 'printer' | 'rtsp' | 'none';

export interface CameraSettings {
  mode: CameraMode;
  /** Only used when mode is "rtsp" */
  rtspUrl?: string;
}

/** Printer as exposed to the browser. The access code never leaves the server. */
export interface PrinterInfo {
  id: string;
  name: string;
  host: string;
  serial: string;
  model: PrinterModel;
  camera: CameraSettings;
  hasAccessCode: boolean;
}

export interface PrinterInput {
  name: string;
  host: string;
  serial: string;
  /** Empty or missing on update keeps the stored code */
  accessCode?: string;
  model: PrinterModel;
  camera: CameraSettings;
}

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'error';

export type JobState = 'IDLE' | 'PREPARE' | 'RUNNING' | 'PAUSE' | 'FINISH' | 'FAILED' | 'UNKNOWN';

export const EXTERNAL_AMS_ID = 255;

export interface Tray {
  /** Unique key "<amsId>:<trayId>" */
  key: string;
  amsId: number;
  trayId: number;
  /** Empty string when the slot is empty / unknown */
  type: string;
  /** RRGGBBAA */
  color: string;
  name?: string;
  infoIdx?: string;
  /** Remaining filament in percent, null if unknown */
  remain: number | null;
  nozzleMin: number | null;
  nozzleMax: number | null;
  empty: boolean;
}

export type AmsKind = 'ams' | 'ams_lite' | 'ams_ht' | 'ams_2_pro';

export interface AmsUnit {
  id: number;
  kind: AmsKind;
  /** Relative humidity in percent (newer firmware) */
  humidityPercent: number | null;
  /** Humidity level 1-5 as reported by older firmware */
  humidityLevel: number | null;
  temperature: number | null;
  trays: Tray[];
}

export interface HmsError {
  /** Formatted like 0300_0100_0001_0007 */
  code: string;
  attr: number;
  rawCode: number;
}

export interface PrinterStatus {
  connection: ConnectionState;
  connectionError?: string;
  job: JobState;
  progress: number;
  remainingMinutes: number | null;
  layer: number | null;
  totalLayers: number | null;
  fileName: string;
  nozzleTemp: number | null;
  nozzleTarget: number | null;
  bedTemp: number | null;
  bedTarget: number | null;
  chamberTemp: number | null;
  /** Fan speeds in percent */
  fans: { part: number | null; aux: number | null; chamber: number | null };
  /** 1 silent, 2 standard, 3 sport, 4 ludicrous */
  speedLevel: number | null;
  light: boolean | null;
  wifiSignal: string | null;
  ams: AmsUnit[];
  externalTrays: Tray[];
  /** Tray key of the currently loaded filament */
  activeTray: string | null;
  hms: HmsError[];
  updatedAt: number;
}

export type FanId = 'part' | 'aux' | 'chamber';

export type SpeedLevel = 1 | 2 | 3 | 4;

export type PrinterCommand =
  | { type: 'light'; on: boolean }
  | { type: 'nozzleTemp'; value: number }
  | { type: 'bedTemp'; value: number }
  | { type: 'fan'; fan: FanId; percent: number }
  | { type: 'speed'; level: SpeedLevel }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | {
      type: 'filament';
      amsId: number;
      trayId: number;
      trayType: string;
      /** RRGGBB or RRGGBBAA */
      color: string;
      nozzleMin: number;
      nozzleMax: number;
      infoIdx?: string;
    }
  | { type: 'refresh' };

export type ServerMessage =
  | { type: 'snapshot'; statuses: Record<string, PrinterStatus> }
  | { type: 'status'; id: string; status: PrinterStatus }
  | { type: 'printers' };
