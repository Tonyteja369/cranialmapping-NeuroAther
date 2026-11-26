import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { analyseDataset } from "./analysis";
import { demoSamples } from "./io";
import { buildReport, pdfSafe } from "./report";
import { experimentJson, experimentSheets } from "./exports";
import { defaultSettings, newExperiment } from "./store";

const exp = newExperiment({ title: "Long title ".repeat(12), objective: "Objective text that is very long. ".repeat(60), source: "demo", decayStartMs: 14000,
  processingLog: Array.from({ length: 80 }, (_, i) => ({ at: new Date(0).toISOString(), op: `op${i}`, settings: { cutoffHz: i, note: "x".repeat(120) } })) });

describe("report & exports", () => {
  it("builds a multi-page PDF with large data and long content", () => {
    const samples = [...demoSamples(), ...demoSamples().map((s) => ({ ...s, timestamp: s.timestamp + 20000 })), ...demoSamples().map((s) => ({ ...s, timestamp: s.timestamp + 40000 }))];
    const sensors = analyseDataset(samples, defaultSettings, "res", exp.sensorLabels);
    const doc = buildReport(exp, sensors, defaultSettings, "demo", "g", null);
    const buf = Buffer.from(doc.output("arraybuffer"));
    writeFileSync("/tmp/nsx-report-test.pdf", buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(doc.getNumberOfPages()).toBeGreaterThan(4);
  });
  it("exports preserve timestamps, sensor IDs and values", () => {
    const samples = demoSamples();
    const j = JSON.parse(experimentJson(exp, samples));
    expect(j.raw.samples[5]).toEqual([samples[5].timestamp, samples[5].sensorId, samples[5].ax, samples[5].ay, samples[5].az]);
    const sheets = experimentSheets(exp, samples);
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([s.header, ...s.rows]), s.name));
    const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<number[]>(back.Sheets["Raw data (g)"], { header: 1 });
    expect(rows.length).toBe(samples.length + 1);
    expect(rows[1]).toEqual([samples[0].timestamp, samples[0].sensorId, samples[0].ax, samples[0].ay, samples[0].az]);
  });
  it("maps unsupported PDF glyphs to readable text", () => {
    expect(pdfSafe("ζ=δ/√(4π²)")).toBe("zeta=delta/sqrt(4pi^2)");
  });
});
