export type SensorId = 1 | 2 | 3;
export const SENSOR_IDS: SensorId[] = [1, 2, 3];
export type Axis = "ax" | "ay" | "az" | "res";
export const AXES: { id: Axis; label: string }[] = [
  { id: "ax", label: "X" },
  { id: "ay", label: "Y" },
  { id: "az", label: "Z" },
  { id: "res", label: "Resultant" },
];

/** Canonical validated sample: device acquisition time in ms, acceleration normalized to g. */
export interface Sample {
  timestamp: number;
  sensorId: SensorId;
  ax: number;
  ay: number;
  az: number;
}

export type DataSource = "live" | "imported" | "demo";

/** One step of a stepped-sine excitation, associated to response interval. */
export interface SweepStep {
  requestedHz: number;
  actualHz: number | null; // only if reported by hardware / user-verified
  tStartMs: number;
  tEndMs: number;
  verified: boolean; // excitation confirmed by firmware or documented by operator
}

export interface Calibration {
  timestamp: string;
  offsets: Record<SensorId, { ax: number; ay: number; az: number }>;
  method: string;
  orientationNotes: string;
  applied: boolean;
}

export interface Experiment {
  id: string;
  title: string;
  createdAt: string;
  acqStart: string | null;
  acqEnd: string | null;
  objective: string;
  sensorLabels: Record<SensorId, string>;
  source: DataSource;
  nominalRateHz: number;
  excitationHz: number | null;
  excitationWaveform: string;
  notes: string;
  quality: "unknown" | "good" | "warning" | "invalid";
  sweepSteps: SweepStep[];
  decayStartMs: number | null;
  calibration: Calibration | null;
  processingLog: { at: string; op: string; settings: Record<string, unknown> }[];
  acquisitionProtocol?: { columns: string; delimiter: string; inputUnit: "g" | "ms2"; timestampUnit: "ms" | "us" | "s"; sensorIdBase: 0 | 1; timestampSource: "device"; storedUnit: "g"; firmware: string | null };
  skull?: SkullRecord;
  acquisitionEvents?: { at: string; action: "start" | "pause" | "resume" | "stop" }[];
}

export interface Settings {
  baud: number;
  delimiter: string;
  columns: string; // e.g. "t,id,ax,ay,az"
  timestampUnit: "ms" | "us" | "s";
  sensorIdBase: 0 | 1;
  inputUnit: "g" | "ms2";
  displayUnit: "g" | "ms2";
  nominalRateHz: number;
  windowSec: number;
  fftSize: number;
  windowFn: "hamming" | "hann" | "rect";
  peakThreshold: number; // fraction of max (0-1)
  fMin: number;
  fMax: number;
  filter: { type: "none" | "lowpass" | "highpass" | "movingavg"; cutoffHz: number; taps: number };
  baseline: "none" | "mean" | "linear";
  msiPair: [SensorId, SensorId];
  msiMetric: "rms" | "peak";
  referenceSensor: SensorId;
  sensorLabels: Record<SensorId, string>;
  satLimitG: number;
  sensorPositions: Record<SensorId, string>;
  skullSites: Record<SensorId, SkullSite>;
}

export type SkullSite = "left-temporal" | "right-temporal" | "frontal" | "ref";
export type SkullMarker = SkullSite | "tx";
export interface SkullRecord {
  placement: Partial<Record<SkullMarker, [number, number, number]>>; // centred model coords
  headLengthCm: number;
  tapeCm: Partial<Record<SensorId, number>>;
  baselineId: string | null;
}

export const G = 9.80665;
