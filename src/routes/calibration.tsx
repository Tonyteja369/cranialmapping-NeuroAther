import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Empty, fmt, Page, Panel } from "@/components/nsx/ui";
import { datasetSpan, useActiveData } from "@/lib/nsx/analysis";
import { mean } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";
import { download, fname } from "@/lib/nsx/io";
import { get, saveMeta, set } from "@/lib/nsx/store";
import type { Calibration, SensorId } from "@/lib/nsx/types";

export const Route = createFileRoute("/calibration")({
  head: head("Calibration", "Stationary offset and baseline estimation saved with each experiment, without modifying raw data."),
  component: Cal,
});

function Cal() {
  const { samples, state } = useActiveData();
  const exp = state.experiment;
  const span = datasetSpan(samples);
  const [win, setWin] = useState({ from: 0, to: 2 });
  const [notes, setNotes] = useState(exp?.calibration?.orientationNotes ?? "Z axis up, sensors stationary on rigid surface");
  const est = (() => {
    if (!span) return null;
    const a = span.startMs + win.from * 1000, b = span.startMs + win.to * 1000;
    const out = {} as Calibration["offsets"];
    const stats: Record<number, { n: number; sd: number }> = {};
    for (const id of [1, 2, 3] as SensorId[]) {
      const seg = samples.filter((x) => x.sensorId === id && x.timestamp >= a && x.timestamp <= b);
      // Offset relative to the expected stationary reading (0,0,1 g with Z up)
      out[id] = { ax: mean(seg.map((x) => x.ax)), ay: mean(seg.map((x) => x.ay)), az: mean(seg.map((x) => x.az)) - 1 };
      const r = seg.map((x) => x.az); const m = mean(r);
      stats[id] = { n: seg.length, sd: Math.sqrt(mean(r.map((v) => (v - m) ** 2))) };
    }
    return { out, stats };
  })();
  const save = async (applied: boolean) => {
    if (!exp || !est) return;
    const cal: Calibration = { timestamp: new Date().toISOString(), offsets: est.out, method: `Stationary mean over ${win.from}–${win.to} s; expected (0,0,+1 g) with Z up`, orientationNotes: notes, applied };
    const next = { ...exp, calibration: cal };
    if (get().experiments.some((e) => e.id === exp.id)) await saveMeta(next); else set({ experiment: next });
    toast.success(applied ? "Offsets saved and applied to processed signals" : "Calibration saved (not applied)");
  };
  const cur = exp?.calibration;
  return (
    <Page title="Calibration" subtitle="Software offset/baseline correction only. A stationary reading is not a metrological calibration against a reference instrument. Raw data are never modified.">
      {!span || !exp ? <Empty title="Load a dataset with a stationary interval" /> : <>
        <Panel title="Stationary interval" right={<><label className="lbl">From (s)<input className="field w-20" type="number" value={win.from} onChange={(e) => setWin({ ...win, from: +e.target.value })} /></label><label className="lbl">To (s)<input className="field w-20" type="number" value={win.to} onChange={(e) => setWin({ ...win, to: +e.target.value })} /></label></>}>
          <table className="tbl"><thead><tr><th>Sensor</th><th>N</th><th>Offset X (g)</th><th>Offset Y (g)</th><th>Offset Z−1 (g)</th><th>σ Z (g)</th><th>Current saved X/Y/Z</th></tr></thead><tbody>
            {([1, 2, 3] as SensorId[]).map((id) => <tr key={id}><td>S{id}</td><td>{est!.stats[id].n}</td><td>{fmt(est!.out[id].ax, 5)}</td><td>{fmt(est!.out[id].ay, 5)}</td><td>{fmt(est!.out[id].az, 5)}</td><td>{fmt(est!.stats[id].sd, 5)}</td><td>{cur ? `${fmt(cur.offsets[id].ax, 4)} / ${fmt(cur.offsets[id].ay, 4)} / ${fmt(cur.offsets[id].az, 4)}` : "—"}</td></tr>)}
          </tbody></table>
          <label className="lbl mt-3">Orientation notes<input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => save(true)}>Save & apply offsets</button>
            <button className="btn" onClick={() => save(false)}>Save without applying</button>
            {cur && <button className="btn" onClick={() => download(fname(exp, "Calibration", "json"), JSON.stringify(cur, null, 2), "application/json")}>Export calibration</button>}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Status: {cur ? `${cur.applied ? "applied" : "saved, not applied"} · ${new Date(cur.timestamp).toLocaleString()}` : "no calibration"}. When applied, offsets are subtracted in the processing pipeline (compare raw vs processed in Signal Processing). The orientation assumption (Z up) must match the physical mounting.</p>
        </Panel>
      </>}
    </Page>
  );
}
