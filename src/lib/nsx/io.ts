import { toast } from "sonner";
import { parseLine, type ProtocolConfig } from "./parser";
import type { Experiment, Sample, SensorId } from "./types";

/** Saves a file with the correct MIME type and reports success/failure. Refuses empty content. */
export function download(name: string, content: BlobPart | Blob, type = "text/plain", quiet = false) {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    if (!blob.size) { toast.error(`${name}: nothing to export`); return false; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    if (!quiet) toast.success(`Downloaded ${name}`);
    return true;
  } catch (e) { toast.error(`Could not create ${name}: ${(e as Error).message}`); return false; }
}
export function downloadDataUrl(name: string, dataUrl: string | null) {
  if (!dataUrl) { toast.error("Image could not be captured"); return; }
  const a = document.createElement("a"); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  toast.success(`Downloaded ${name}`);
}
export const fname = (exp: Experiment | null, kind: string, ext: string) =>
  `NeuroSenseX_${(exp?.id ?? "Unsaved").replace(/[^\w-]/g, "_")}_${kind}.${ext}`;

export type Sheet = { name: string; header: string[]; rows: (string | number | null)[][] };
/** XLSX workbook built from real tables; the library is loaded only when exporting. */
export async function downloadXlsx(name: string, sheets: Sheet[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows.slice(0, 1_048_000).map((r) => r.map((v) => (typeof v === "number" && !isFinite(v) ? null : v)))]);
    ws["!cols"] = s.header.map((h) => ({ wch: Math.max(10, Math.min(60, h.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return download(name, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

export function toCsv(header: string[], rows: (string | number)[][]) {
  return [header.join(","), ...rows.map((r) => r.map((v) => (typeof v === "number" ? (isFinite(v) ? v : "") : `"${String(v).replace(/"/g, '""')}"`)).join(","))].join("\n");
}

export function rawCsv(samples: Sample[]) {
  return toCsv(["timestamp_ms", "sensor_id", "ax_g", "ay_g", "az_g"], samples.map((s) => [s.timestamp, s.sensorId, s.ax, s.ay, s.az]));
}

/** CSV import shares the serial validator; header explicitly supplies field/time mapping. */
export function parseCsv(text: string, cfg: ProtocolConfig = { delimiter: ",", columns: "t,id,ax,ay,az" }): { samples: Sample[]; errors: string[]; unit: "g" | "ms2" | "unknown" } {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (!lines.length) return { samples: [], errors: ["File is empty"], unit: "unknown" };
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const hasHeader = header.some((h) => /^(timestamp(?:_ms|_us|_s)?|t)$/.test(h));
  const unit = hasHeader && header.some((h) => /^a[xyz]_ms2$/.test(h)) ? "ms2" : hasHeader && header.some((h) => /^a[xyz]_g$/.test(h)) ? "g" : cfg.inputUnit ?? "unknown";
  const canonicalExport = header.join(",") === "timestamp_ms,sensor_id,ax_g,ay_g,az_g";
  const protocol = { ...cfg, ...(hasHeader ? { columns: header.join(","), delimiter: "," } : {}), ...(canonicalExport ? { sensorIdBase: 1 as const } : {}), inputUnit: unit === "unknown" ? "g" as const : unit };
  const samples: Sample[] = [], errors: string[] = [];
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const result = parseLine(lines[i], protocol);
    if (result.kind === "sample") samples.push(result.sample);
    else if (result.kind === "error" && errors.length < 20) errors.push(`Line ${i + 1}: ${result.error}`);
  }
  return { samples, errors, unit };
}

/** Deterministic, clearly-labelled synthetic dataset for UI demonstration only. */
export function demoSamples(): Sample[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const out: Sample[] = [];
  const amp = { 1: 0.05, 2: 0.038, 3: 0.022 } as const;
  for (let i = 0; i < 2000; i++) {
    for (const s of [1, 2, 3] as SensorId[]) {
      const t = i * 10 + (s - 1) * 3; // multiplexed offset
      const ts = t / 1000;
      const decay = ts > 14 ? Math.exp(-(ts - 14) * 1.2) : 1;
      const v = amp[s] * decay * Math.sin(2 * Math.PI * 12.5 * ts) + 0.01 * Math.sin(2 * Math.PI * 4 * ts) + 0.004 * rnd();
      out.push({ timestamp: t, sensorId: s, ax: v * 0.4 + 0.002 * rnd(), ay: v * 0.3 + 0.002 * rnd(), az: 1 + v });
    }
  }
  return out;
}
