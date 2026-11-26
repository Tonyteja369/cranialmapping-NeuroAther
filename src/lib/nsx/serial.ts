/* Web Serial connection manager for the ESP32. */
import { detectHeader, LineBuffer, parseLine } from "./parser";
import { get, log, newExperiment, set } from "./store";
import type { Sample } from "./types";

// Minimal Web Serial typings
interface SPort {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
let port: SPort | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let keepReading = false;
let connecting = false;
let closing: Promise<void> | null = null;
let connectionEpoch = 0;

const PREVIEW_MAX = 9000;

export async function connect() {
  if (connecting || closing || get().serial.connected) return;
  connecting = true;
  try { await connectPort(); } finally { connecting = false; }
}
async function connectPort() {
  const epoch = ++connectionEpoch;
  const st = get();
  if (!st.serial.supported) throw new Error("Web Serial is not available in this browser.");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = (await (navigator as any).serial.requestPort()) as SPort;
    if (epoch !== connectionEpoch) return;
    port = selected;
  } catch (e) {
    const msg = (e as Error).name === "NotFoundError" ? "No port selected." : (e as Error).message;
    set({ serial: { ...get().serial, error: msg } });
    return;
  }
  try {
    const openingPort = port;
    await openingPort.open({ baudRate: st.settings.baud });
    if (epoch !== connectionEpoch) {
      try { await openingPort.close(); } catch { /* Port already released. */ }
      return;
    }
  } catch (e) {
    const err = e as Error;
    const msg = /already open|Failed to open|NetworkError|InvalidState/i.test(err.message + err.name)
      ? "Could not open the port. It is probably in use by Arduino Serial Monitor or another application — close it and try again."
      : err.message;
    set({ serial: { ...get().serial, error: msg } });
    log("error", msg);
    port = null;
    return;
  }
  const info = port.getInfo();
  const label = info.usbVendorId ? `USB ${info.usbVendorId.toString(16).padStart(4, "0")}:${(info.usbProductId ?? 0).toString(16).padStart(4, "0")}` : "Serial port";
  const now = new Date().toISOString();
  localStorage.setItem("nsx.lastConnected", now);
  set({
    serial: { ...get().serial, connected: true, error: null, portLabel: label, lastConnected: now, lines: 0, validSamples: 0, parseErrors: 0, textLines: 0, firmware: null, reportedRate: null, sensorStatus: {}, lastSampleAt: {}, latestSample: {}, sampleCounts: {}, protocolDiagnostics: [], streamColumns: null },
    preview: [],
    console: [],
  });
  log("info", `Connected ${label} @ ${st.settings.baud} baud`);
  readLoop();
}

async function readLoop() {
  if (!port?.readable) return;
  keepReading = true;
  const buf = new LineBuffer();
  const dec = new TextDecoder();
  while (port?.readable && keepReading) {
    reader = port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) { keepReading = false; break; }
        if (value) handleLines(buf.push(dec.decode(value, { stream: true })));
      }
    } catch (e) {
      log("error", `Serial read error: ${(e as Error).message}`);
      set({ serial: { ...get().serial, error: `Read error: ${(e as Error).message}` } });
      keepReading = false;
    } finally {
      reader?.releaseLock();
      reader = null;
    }
  }
  if (get().serial.connected) await disconnect();
}

/** Shared ingress used by the Web Serial reader; exposes each validation result for diagnostics. */
export function handleLines(lines: string[], receivedAt = Date.now()) {
  const s = get();
  let cfg = s.serial.streamColumns ? { ...s.settings, columns: s.serial.streamColumns } : s.settings;
  const serial = { ...s.serial, lastSampleAt: { ...s.serial.lastSampleAt }, latestSample: { ...s.serial.latestSample }, sampleCounts: { ...s.serial.sampleCounts }, protocolDiagnostics: [...s.serial.protocolDiagnostics] };
  const con = [...s.console];
  const excitations = [...s.excitations];
  const newSamples: Sample[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    serial.lines++;
    con.push(line);
    const header = detectHeader(line, cfg.delimiter);
    if (header && header !== cfg.columns.split(",").map((c) => c.trim().toLowerCase()).join(",")) {
      serial.streamColumns = header;
      cfg = { ...cfg, columns: header };
      log("info", `Firmware header adopted for this session: ${header}`);
    }
    const r = parseLine(line, cfg);
    serial.protocolDiagnostics.push({ raw: line, result: r });
    switch (r.kind) {
      case "sample": {
        const x = r.sample;
        newSamples.push(x);
        serial.validSamples++;
        serial.lastSampleAt[x.sensorId] = receivedAt;
        serial.latestSample[x.sensorId] = x;
        serial.sampleCounts[x.sensorId] = (serial.sampleCounts[x.sensorId] ?? 0) + 1;
        break;
      }
      case "status": serial.sensorStatus = { ...serial.sensorStatus, ...r.sensors }; log("info", `Firmware status: ${line}`); break;
      case "firmware": serial.firmware = r.version; break;
      case "rate": serial.reportedRate = r.hz; break;
      case "excitation": excitations.push({ hz: r.hz, t: r.t, at: new Date(receivedAt).toISOString() }); break;
      case "text": serial.textLines++; break;
      case "error": serial.parseErrors++; if (serial.parseErrors < 50 || serial.parseErrors % 100 === 0) log("warn", `Parse error: ${r.error} — "${r.line.slice(0, 80)}"`); break;
    }
  }
  if (con.length > 400) con.splice(0, con.length - 400);
  const preview = [...s.preview, ...newSamples];
  if (preview.length > PREVIEW_MAX) preview.splice(0, preview.length - PREVIEW_MAX);
  serial.protocolDiagnostics = serial.protocolDiagnostics.slice(-50);
  const samples = s.acquiring && !s.paused && newSamples.length ? [...s.samples, ...newSamples] : s.samples;
  set({ serial, console: con, preview, samples, excitations });
}

export async function disconnect() {
  connectionEpoch++;
  if (closing) return closing;
  closing = releasePort();
  try { await closing; } finally { closing = null; }
}
async function releasePort() {
  keepReading = false;
  try { await reader?.cancel(); } catch { /* noop */ }
  try { await port?.close(); } catch (e) { log("warn", `Close: ${(e as Error).message}`); }
  port = null;
  if (get().acquiring) stopAcquisition();
  set({ serial: { ...get().serial, connected: false } });
  log("info", "Serial port released");
}

export async function sendCommand(cmd: string) {
  if (!port?.writable) throw new Error("Not connected");
  const w = port.writable.getWriter();
  try { await w.write(new TextEncoder().encode(cmd + "\n")); } finally { w.releaseLock(); }
  log("info", `TX: ${cmd}`);
}

export function startAcquisition() {
  const s = get();
  if (!s.serial.connected) throw new Error("Connect the ESP32 first");
  if (s.acquiring) throw new Error("Acquisition already running");
  const at = new Date().toISOString();
  const base = s.experiment?.source === "live" && !s.experiment.acqStart && !s.samples.length ? s.experiment : newExperiment();
  const exp = { ...base, acqStart: at, acqEnd: null, source: "live" as const, nominalRateHz: s.settings.nominalRateHz,
    acquisitionProtocol: { columns: s.serial.streamColumns ?? s.settings.columns, delimiter: s.settings.delimiter, inputUnit: s.settings.inputUnit, timestampUnit: s.settings.timestampUnit, sensorIdBase: s.settings.sensorIdBase, timestampSource: "device" as const, storedUnit: "g" as const, firmware: s.serial.firmware },
    acquisitionEvents: [{ at, action: "start" as const }] };
  set({ experiment: exp, samples: [], source: "live", acquiring: true, paused: false, acqStartedAt: Date.now(), excitations: [] });
  log("info", `Acquisition started: ${exp.id}`);
}
export function pauseAcquisition(p: boolean) {
  const s = get();
  if (!s.acquiring || !s.experiment || s.paused === p) return;
  set({ paused: p, experiment: { ...s.experiment, acquisitionEvents: [...(s.experiment.acquisitionEvents ?? []), { at: new Date().toISOString(), action: p ? "pause" : "resume" }] } });
  log("info", p ? "Acquisition paused" : "Acquisition resumed");
}
export function stopAcquisition() {
  const s = get();
  if (!s.acquiring) return;
  const at = new Date().toISOString();
  set({ acquiring: false, paused: false, experiment: s.experiment ? { ...s.experiment, acqEnd: at, acquisitionProtocol: s.experiment.acquisitionProtocol ? { ...s.experiment.acquisitionProtocol, firmware: s.serial.firmware } : undefined, acquisitionEvents: [...(s.experiment.acquisitionEvents ?? []), { at, action: "stop" }] } : null });
  log("info", `Acquisition stopped (${s.samples.length} samples). Save the experiment to persist it.`);
}
