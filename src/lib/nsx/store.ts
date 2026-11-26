import { useSyncExternalStore } from "react";
import type { DataSource, Experiment, Sample, SensorId, Settings } from "./types";
import { dbDeleteExperiment, dbListExperiments, dbLoadDataset, dbSaveDataset, dbSaveExperiment } from "./db";
import { dbSaveRecording } from "./db";
import type { ParseResult } from "./parser";
import { STREAM_PROTOCOL } from "./parser";

export const defaultSettings: Settings = {
  baud: 115200,
  ...STREAM_PROTOCOL,
  displayUnit: "g",
  nominalRateHz: 100,
  windowSec: 10,
  fftSize: 256,
  windowFn: "hamming",
  peakThreshold: 0.3,
  fMin: 0.5,
  fMax: 50,
  filter: { type: "none", cutoffHz: 20, taps: 5 },
  baseline: "mean",
  msiPair: [1, 2],
  msiMetric: "rms",
  referenceSensor: 1,
  sensorLabels: { 1: "Sensor 1", 2: "Sensor 2", 3: "Sensor 3" },
  satLimitG: 1.99,
  sensorPositions: { 1: "left-temporal", 2: "right-temporal", 3: "occipital" },
  skullSites: { 1: "left-temporal", 2: "right-temporal", 3: "frontal" },
};

export interface LogEntry { at: string; level: "info" | "warn" | "error"; msg: string }

export interface NsxState {
  settings: Settings;
  samples: Sample[]; // active dataset (raw, in g)
  preview: Sample[]; // live ring buffer while connected
  source: DataSource | null;
  experiment: Experiment | null;
  experiments: Experiment[];
  serial: {
    supported: boolean;
    connected: boolean;
    portLabel: string;
    error: string | null;
    lastConnected: string | null;
    lines: number;
    validSamples: number;
    parseErrors: number;
    textLines: number;
    firmware: string | null;
    reportedRate: number | null;
    sensorStatus: Partial<Record<SensorId, boolean>>;
    lastSampleAt: Partial<Record<SensorId, number>>;
    latestSample: Partial<Record<SensorId, Sample>>;
    sampleCounts: Partial<Record<SensorId, number>>;
    protocolDiagnostics: { raw: string; result: ParseResult }[];
    /** Column header announced by the firmware this session (explicit units); overrides saved columns while connected. */
    streamColumns?: string | null;
  };
  console: string[];
  acquiring: boolean;
  paused: boolean;
  acqStartedAt: number | null;
  excitations: { hz: number; t: number | null; at: string }[];
  log: LogEntry[];
  version: number;
}

const SKEY = "nsx.settings.v1";
function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return defaultSettings;
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || "null");
    return s ? { ...defaultSettings, ...s, filter: { ...defaultSettings.filter, ...s.filter } } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

let state: NsxState = {
  settings: defaultSettings,
  samples: [],
  preview: [],
  source: null,
  experiment: null,
  experiments: [],
  serial: {
    supported: false, connected: false, portLabel: "", error: null, lastConnected: null, lines: 0, validSamples: 0,
    parseErrors: 0, textLines: 0, firmware: null, reportedRate: null, sensorStatus: {}, lastSampleAt: {}, latestSample: {}, sampleCounts: {}, protocolDiagnostics: [],
  },
  console: [],
  acquiring: false,
  paused: false,
  acqStartedAt: null,
  excitations: [],
  log: [],
  version: 0,
};

const serverState = { ...state, serial: { ...state.serial } };
const subs = new Set<() => void>();
let scheduled = false;
function emit() {
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    state = { ...state, version: state.version + 1 };
    subs.forEach((f) => f());
  };
  // Timer-based batching: animation frames stop in background tabs, which froze live counters.
  if (typeof window !== "undefined") setTimeout(run, 33);
  else run();
}
export function set(patch: Partial<NsxState> | ((s: NsxState) => Partial<NsxState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}
export const get = () => state;
export function useNsx() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
    () => serverState,
  );
}

export function log(level: LogEntry["level"], msg: string) {
  set({ log: [{ at: new Date().toISOString(), level, msg }, ...state.log].slice(0, 500) });
}

let initialized = false;
export async function initStore() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  set({ settings: loadSettings(), serial: { ...state.serial, supported: "serial" in navigator, lastConnected: localStorage.getItem("nsx.lastConnected") } });
  try {
    set({ experiments: (await dbListExperiments()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  } catch (e) {
    log("error", `IndexedDB unavailable: ${(e as Error).message}`);
  }
  emit();
}

export function updateSettings(p: Partial<Settings>) {
  if (state.serial.connected && ["baud", "columns", "delimiter", "inputUnit", "timestampUnit", "sensorIdBase"].some((key) => key in p)) {
    throw new Error("Disconnect before changing the acquisition protocol");
  }
  const settings = { ...state.settings, ...p };
  localStorage.setItem(SKEY, JSON.stringify(settings));
  set({ settings });
}

/** Save 3D skull placement/metadata on the active experiment (persisted when the experiment is saved). */
export async function updateExperimentSkull(skull: NonNullable<Experiment["skull"]>) {
  const e = state.experiment;
  if (!e) throw new Error("No experiment selected");
  const next = { ...e, skull };
  const saved = state.experiments.some((x) => x.id === e.id);
  set((s) => ({ experiment: next, experiments: s.experiments.map((x) => (x.id === e.id ? next : x)) }));
  if (saved) await dbSaveExperiment(next);
  return saved;
}

export function newExperiment(partial: Partial<Experiment> = {}): Experiment {
  const n = state.experiments.length + 1;
  return {
    id: `EXP-${String(n).padStart(3, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
    title: `Experiment ${String(n).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    acqStart: null,
    acqEnd: null,
    objective: "",
    sensorLabels: { ...state.settings.sensorLabels },
    source: "live",
    nominalRateHz: state.settings.nominalRateHz,
    excitationHz: null,
    excitationWaveform: "none",
    notes: "",
    quality: "unknown",
    sweepSteps: [],
    decayStartMs: null,
    calibration: null,
    processingLog: [],
    ...partial,
  };
}

export function setActive(exp: Experiment | null, samples: Sample[], source: DataSource | null) {
  if (state.acquiring) throw new Error("Stop acquisition before replacing the active experiment");
  set({ experiment: exp, samples, source });
}

export async function saveExperiment(exp = state.experiment) {
  if (!exp) throw new Error("No active experiment");
  if (state.acquiring) throw new Error("Stop acquisition before saving");
  if (state.experiment?.id !== exp.id) throw new Error("Only the active experiment can be saved");
  if (exp.source === "live" && exp.acqStart && !exp.acqEnd) throw new Error("Stop acquisition before saving");
  const samples = state.samples.map((sample) => ({ ...sample }));
  await dbSaveRecording(exp, samples);
  const others = state.experiments.filter((e) => e.id !== exp.id);
  set({ experiments: [exp, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), ...(state.experiment?.id === exp.id ? { experiment: exp } : {}) });
  log("info", `Saved ${exp.id} (${samples.length} samples)`);
}
export async function saveMeta(exp: Experiment) {
  await dbSaveExperiment(exp);
  set((s) => ({ experiments: s.experiments.map((e) => (e.id === exp.id ? exp : e)), experiment: s.experiment?.id === exp.id ? exp : s.experiment }));
}
export async function openExperiment(id: string) {
  if (state.acquiring) throw new Error("Stop acquisition before opening another experiment");
  const exp = state.experiments.find((e) => e.id === id);
  if (!exp) return;
  const data = (await dbLoadDataset(id)) ?? [];
  setActive(exp, data, exp.source);
  log("info", `Opened ${id}`);
}
export async function deleteExperiment(id: string) {
  if (state.acquiring && state.experiment?.id === id) throw new Error("Stop acquisition before deleting the active experiment");
  await dbDeleteExperiment(id);
  set((s) => ({ experiments: s.experiments.filter((e) => e.id !== id), ...(s.experiment?.id === id ? { experiment: null, samples: [], source: null } : {}) }));
  log("warn", `Deleted ${id}`);
}
export async function duplicateExperiment(id: string) {
  const exp = state.experiments.find((e) => e.id === id);
  if (!exp) return;
  const data = (await dbLoadDataset(id)) ?? [];
  const copy = newExperiment({ ...exp, id: undefined as never, createdAt: undefined as never, title: `${exp.title} (copy)` });
  const fresh = { ...exp, ...copy, id: newExperiment().id, createdAt: new Date().toISOString(), title: `${exp.title} (copy)` };
  await dbSaveExperiment(fresh);
  await dbSaveDataset(fresh.id, data);
  set((s) => ({ experiments: [fresh, ...s.experiments] }));
}
export function addProcessingOp(op: string, settings: Record<string, unknown>) {
  if (!state.experiment) return;
  set({ experiment: { ...state.experiment, processingLog: [...state.experiment.processingLog, { at: new Date().toISOString(), op, settings }].slice(-200) } });
}
