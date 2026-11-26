import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { HeadMap } from "@/components/nsx/HeadMap";
import { Empty, Page, Panel, SourceTag } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { unitLabel } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";
import { download, downloadDataUrl, downloadXlsx, fname, rawCsv, toCsv } from "@/lib/nsx/io";
import { experimentJson, experimentSheets } from "@/lib/nsx/exports";
import { svgToPng } from "./map";

export const Route = createFileRoute("/reports")({
  head: head("Reports", "Generate PDF research reports and export raw, processed, FFT, metadata and calibration files."),
  component: Reports,
});

const tick = () => new Promise((r) => setTimeout(r, 30));

function Reports() {
  const { sensors, source, state, samples } = useAnalysis("res");
  const [busy, setBusy] = useState<string | null>(null);
  const exp = state.experiment;
  const st = state.settings;
  const unit = unitLabel(st.displayUnit);
  const u = st.displayUnit;
  if (!exp || !samples.length) return <Page title="Reports & Export"><Empty title="No experiment data to export">Open a saved experiment, import a CSV or record from the hardware first.</Empty></Page>;
  const run = async (key: string, fn: () => unknown) => {
    setBusy(key); await tick();
    try { await fn(); } catch (e) { toast.error(`${key} failed: ${(e as Error).message}`); } finally { setBusy(null); }
  };
  const pdf = () => run("PDF report", async () => {
    const { buildReport } = await import("@/lib/nsx/report");
    const png = await svgToPng("nsx-report-map").catch(() => null);
    const doc = buildReport(exp, sensors, st, source, unit, png);
    download(fname(exp, "Report", "pdf"), doc.output("blob"), "application/pdf");
  });
  const files: [string, () => unknown][] = [
    ["Complete dataset XLSX", () => downloadXlsx(fname(exp, "Dataset", "xlsx"), experimentSheets(exp, samples, sensors, u))],
    ["Complete experiment JSON", () => download(fname(exp, "Data", "json"), experimentJson(exp, samples, sensors, st), "application/json")],
    ["Raw sensor data CSV", () => download(fname(exp, "RawData", "csv"), rawCsv(samples), "text/csv")],
    ["Processed sensor data CSV", () => download(fname(exp, "Processed", "csv"), toCsv(["timestamp_ms", "sensor_id", `resultant_raw_${u}`, `resultant_processed_${u}`], sensors.flatMap((s) => s.t.map((t, i) => [t, s.id, s.raw[i], s.processed[i]]))), "text/csv")],
    ["FFT spectrum CSV", () => download(fname(exp, "FFT", "csv"), toCsv(["sensor_id", "frequency_Hz", `amplitude_${u}`], sensors.flatMap((s) => (s.sp ? s.sp.freq.map((f, i) => [s.id, f, s.sp!.mag[i]]) : []))), "text/csv")],
    ["Experiment metadata JSON", () => download(fname(exp, "Metadata", "json"), JSON.stringify({ ...exp, settings: st, measured: sensors.map((s) => ({ id: s.id, n: s.q.n, fs: s.fs, quality: s.q })) }, null, 2), "application/json")],
    ["Calibration configuration JSON", () => exp.calibration ? download(fname(exp, "Calibration", "json"), JSON.stringify(exp.calibration, null, 2), "application/json") : toast.error("No calibration saved for this experiment")],
    ["Mechanical Resonance Map PNG", async () => downloadDataUrl(fname(exp, "ResonanceMap", "png"), await svgToPng("nsx-report-map"))],
  ];
  return (
    <Page title="Reports & Export" subtitle={`${exp.id} · ${exp.title} · ${samples.length.toLocaleString()} samples`} actions={<><SourceTag source={source} /><button className="btn btn-primary" disabled={!!busy} onClick={pdf}>{busy === "PDF report" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Download PDF report</button></>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Data exports">
          <div className="grid gap-2 md:grid-cols-2">{files.map(([l, f]) => <button key={l} className="btn justify-start" disabled={!!busy} onClick={() => run(l, f)}>{busy === l && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{l}</button>)}</div>
          <p className="mt-3 text-[11px] text-muted-foreground">Raw data are exported in g with device timestamps and sensor IDs 1–3. Processed and derived results are kept in separate files/sheets. The PDF only includes sections supported by this experiment's data; others are marked “Not available”.</p>
        </Panel>
        <Panel title="Map included in report"><HeadMap id="nsx-report-map" values={sensors.map((s) => ({ id: s.id, label: s.label, value: s.rmsVib, quality: s.qualityStatus }))} positions={st.sensorPositions} unit={unit} metricName="RMS vibration" /></Panel>
      </div>
    </Page>
  );
}
