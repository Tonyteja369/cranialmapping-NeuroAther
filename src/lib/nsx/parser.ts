import { G, type Sample, type SensorId } from "./types";

export const STREAM_PROTOCOL = { delimiter: ",", columns: "timestamp_us,sensor_id,ax_g,ay_g,az_g", timestampUnit: "us", sensorIdBase: 1, inputUnit: "g" } as const;

export interface ProtocolConfig {
  delimiter: string;
  columns: string;
  timestampUnit?: "ms" | "us" | "s";
  sensorIdBase?: 0 | 1;
  inputUnit?: "g" | "ms2";
}
export type ParseResult =
  | { kind: "sample"; sample: Sample; detectedSensorId: number }
  | { kind: "status"; sensors: Partial<Record<SensorId, boolean>> }
  | { kind: "firmware"; version: string }
  | { kind: "rate"; hz: number }
  | { kind: "excitation"; hz: number; t: number | null }
  | { kind: "text"; text: string }
  | { kind: "error"; error: string; line: string; detectedSensorId?: number };

export function normalizeSensorId(id: number, base: 0 | 1): SensorId | null {
  const normalized = id + (base === 0 ? 1 : 0);
  return Number.isInteger(id) && [1, 2, 3].includes(normalized) ? normalized as SensorId : null;
}
const alias = (column: string) => {
  const c = column.toLowerCase().trim();
  if (["t", "timestamp", "timestamp_ms", "timestamp_us", "timestamp_s"].includes(c)) return "timestamp";
  if (["id", "s", "sensor_id", "sensorid"].includes(c)) return "sensorId";
  if (/^a[xyz](_g|_ms2)?$/.test(c)) return c.slice(0, 2);
  return "_";
};

/** Returns the normalized column list when a line is a complete firmware header (e.g. timestamp_us,sensor_id,ax_g,ay_g,az_g). */
export function detectHeader(raw: string, delimiter: string): string | null {
  const d = delimiter === "\\t" ? "\t" : delimiter;
  if (!d) return null;
  const parts = raw.trim().split(d).map((p) => p.trim().toLowerCase());
  if (parts.some((p) => !p || /^[+-]?[\d.]/.test(p))) return null;
  const keys = parts.map(alias);
  return ["timestamp", "sensorId", "ax", "ay", "az"].every((k) => keys.filter((x) => x === k).length === 1) ? parts.join(",") : null;
}

/** One parser for serial and CSV import. No inferred IDs, units or host-generated time. */
export function parseLine(raw: string, cfg: ProtocolConfig): ParseResult {
  const line = raw.trim();
  const error = (reason: string, detectedSensorId?: number): ParseResult => ({ kind: "error", error: reason, line, ...(detectedSensorId === undefined ? {} : { detectedSensorId }) });
  if (!line || line.startsWith("#")) return { kind: "text", text: line };
  if (/^STATUS(?:,|:|$)/i.test(line)) {
    const sensors: Partial<Record<SensorId, boolean>> = {};
    const tokens = line.slice(6).replace(/^[:,]/, "").split(",");
    if (!tokens.some((token) => token.trim())) return error("Missing STATUS sensor entries");
    for (const token of tokens) {
      const m = /^\s*S([0-3])\s*=\s*(OK|FAIL|1|0|TRUE|FALSE|FOUND|NOT_FOUND)\s*$/i.exec(token);
      if (!m) return error("Malformed STATUS entry");
      const id = normalizeSensorId(Number(m[1]), cfg.sensorIdBase ?? 1);
      if (id === null || id in sensors) return error("Invalid or duplicate STATUS sensor ID");
      sensors[id] = /^(OK|1|TRUE|FOUND)$/i.test(m[2]);
    }
    return { kind: "status", sensors };
  }
  if (/^FW[,:]/i.test(line)) {
    const version = line.slice(3).trim();
    return version ? { kind: "firmware", version } : error("Missing firmware version");
  }
  if (/^RATE,/i.test(line)) {
    const value = line.slice(5).trim();
    const hz = Number(value);
    return value && Number.isFinite(hz) && hz > 0 ? { kind: "rate", hz } : error("Invalid RATE value");
  }
  if (/^EXC,/i.test(line)) {
    const p = line.split(",");
    const hz = Number(p[1]), t = p.length === 3 ? Number(p[2]) : null;
    return p.length >= 2 && p.length <= 3 && p[1].trim() && Number.isFinite(hz) && hz >= 0 && (t === null || (p[2].trim() && Number.isFinite(t)))
      ? { kind: "excitation", hz, t } : error("Invalid EXC record (time must be device ms)");
  }
  // Board-tagged raw record: DATA,timestamp_us,sensor_id(1–3),ax,ay,az with MPU6050 raw counts at ±2 g (16384 LSB/g).
  if (/^DATA,/i.test(line)) {
    const p = line.split(",").slice(1).map((x) => x.trim());
    if (p.length !== 5) return error(`DATA record expects 5 fields, got ${p.length}`);
    const n = p.map(Number);
    if (p.some((x) => !x) || !n.every(Number.isFinite)) return error("Missing or non-finite value in DATA record");
    const id = normalizeSensorId(n[1], 1);
    if (id === null) return error(`Sensor id ${n[1]} outside 1–3 range`, n[1]);
    const LSB = 16384;
    return { kind: "sample", sample: { timestamp: n[0] / 1000, sensorId: id, ax: n[2] / LSB, ay: n[3] / LSB, az: n[4] / LSB }, detectedSensorId: n[1] };
  }
  const columns = cfg.columns.split(",").map((c) => c.trim().toLowerCase());
  const keys = columns.map(alias);
  const delimiter = cfg.delimiter === "\\t" ? "\t" : cfg.delimiter;
  if (!delimiter) return error("Delimiter is empty");
  const parts = line.split(delimiter).map((p) => p.trim());
  // Headers/ordinary diagnostic text are not data. Non-finite and missing numeric fields are candidates.
  if (parts.every((p, i) => p.toLowerCase() === columns[i]) && parts.length === columns.length) return { kind: "text", text: line };
  const timeIndex = keys.indexOf("timestamp");
  const numericLike = (p: string | undefined) => p !== undefined && /^(?:[+-]?(?:\d|\.|Infinity)|NaN|$)/i.test(p);
  const candidate = numericLike(parts[0]) || (timeIndex >= 0 && numericLike(parts[timeIndex]) && parts.length > 1);
  if (!candidate) return { kind: "text", text: line };
  if (parts.length !== columns.length) return error(`Expected ${columns.length} fields, got ${parts.length}; check column mapping`);
  const record: Record<string, number> = {};
  for (const required of ["timestamp", "sensorId", "ax", "ay", "az"]) {
    if (keys.filter((k) => k === required).length !== 1) return error(`Column map must contain exactly one '${required}'`);
  }
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === "_") continue;
    const value = Number(parts[i]);
    if (!parts[i] || !Number.isFinite(value)) return error(`Missing or non-finite value in '${columns[i]}'`);
    record[keys[i]] = value;
  }
  const sensorId = normalizeSensorId(record.sensorId, cfg.sensorIdBase ?? 1);
  if (sensorId === null) return error(`Sensor id ${record.sensorId} outside configured ${cfg.sensorIdBase === 0 ? "0–2" : "1–3"} range`, record.sensorId);
  const timeColumn = columns[timeIndex];
  const timeUnit = timeColumn.endsWith("_us") ? "us" : timeColumn.endsWith("_ms") ? "ms" : timeColumn.endsWith("_s") ? "s" : cfg.timestampUnit ?? "ms";
  const timestamp = record.timestamp * (timeUnit === "us" ? 0.001 : timeUnit === "s" ? 1000 : 1);
  // Explicit per-column units take precedence over legacy incoming-unit settings.
  const acceleration = (key: string) => {
    const column = columns[keys.indexOf(key)];
    const unit = column.endsWith("_g") ? "g" : column.endsWith("_ms2") ? "ms2" : cfg.inputUnit;
    return record[key] * (unit === "ms2" ? 1 / G : 1);
  };
  const sample = { timestamp, sensorId, ax: acceleration("ax"), ay: acceleration("ay"), az: acceleration("az") };
  return Object.values(sample).every(Number.isFinite) ? { kind: "sample", sample, detectedSensorId: record.sensorId } : error("Normalization overflow", record.sensorId);
}

/** CR, LF and CRLF, including a CRLF pair split across reads. */
export class LineBuffer {
  private buffer = "";
  private afterCR = false;
  push(chunk: string): string[] {
    const lines: string[] = [];
    for (const character of chunk) {
      if (character === "\n" && this.afterCR) { this.afterCR = false; continue; }
      this.afterCR = false;
      if (character === "\r" || character === "\n") {
        lines.push(this.buffer);
        this.buffer = "";
        this.afterCR = character === "\r";
      } else this.buffer += character;
    }
    return lines;
  }
}