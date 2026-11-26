import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EChart } from "@/components/nsx/EChart";
import { Empty, fmt, Page, Panel, SourceTag, SYNC_WARNING } from "@/components/nsx/ui";
import { analyseDataset, useAnalysis, type SensorAnalysis } from "@/lib/nsx/analysis";
import { attenuationDb, interpCorrelation, unitLabel } from "@/lib/nsx/dsp";
import { dbLoadDataset } from "@/lib/nsx/db";
import { head } from "@/lib/nsx/head";
import type { Experiment } from "@/lib/nsx/types";

export const Route = createFileRoute("/comparison")({
  head: head("Sensor Comparison", "Compare the three sensors and historical experiments with compatibility warnings."),
  component: Comparison,
});
const css = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : undefined);

function Comparison() {
  const { sensors, source, usingPreview, state } = useAnalysis("res");
  const unit = unitLabel(state.settings.displayUnit);
  const ref = sensors[state.settings.referenceSensor - 1];
  const pairs: [number, number][] = [[0, 1], [1, 2], [0, 2]];
  const t0 = Math.min(...sensors.filter((s) => s.t.length).map((s) => s.t[0]));
  const wave = { tooltip: { trigger: "axis" as const }, xAxis: { type: "value" as const, name: "Time (s)", nameLocation: "middle" as const, nameGap: 24, scale: true }, yAxis: { type: "value" as const, name: unit, scale: true },
    series: sensors.filter((s) => s.t.length).map((s) => ({ name: `S${s.id}`, type: "line" as const, showSymbol: false, sampling: "lttb" as const, lineStyle: { width: 1, color: css(`--sensor-${s.id}`) }, itemStyle: { color: css(`--sensor-${s.id}`) }, data: s.t.map((t, i) => [(t - t0) / 1000, s.processed[i]]) })) };
  const spec = { tooltip: { trigger: "axis" as const }, xAxis: { type: "value" as const, name: "Frequency (Hz)", nameLocation: "middle" as const, nameGap: 24 }, yAxis: { type: "value" as const, name: unit },
    series: sensors.filter((s) => s.sp).map((s) => ({ name: `S${s.id}`, type: "line" as const, showSymbol: false, lineStyle: { width: 1, color: css(`--sensor-${s.id}`) }, itemStyle: { color: css(`--sensor-${s.id}`) }, data: s.sp!.freq.map((f, i) => [f, s.sp!.mag[i]]) })) };
  return (
    <Page title="Sensor Comparison" subtitle="Processed resultant signals." actions={<SourceTag source={source} preview={usingPreview} />}>
      <div className="notice">{SYNC_WARNING}</div>
      {!sensors.some((s) => s.t.length) ? <Empty title="No data loaded" /> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Overlaid waveforms"><EChart option={wave} height={260} /></Panel>
          <Panel title="Spectrum comparison"><EChart option={spec} height={260} /></Panel>
        </div>
        <Panel title="Pairwise comparison">
          <table className="tbl"><thead><tr><th>Pair</th><th>RMS A / B ({unit})</th><th>Peak A / B ({unit})</th><th>Relative attenuation B vs A (dB)</th><th>Correlation (interp.)</th></tr></thead><tbody>
            {pairs.map(([i, j]) => { const A = sensors[i], B = sensors[j]; return (
              <tr key={`${i}${j}`}><td>S{A.id}–S{B.id}</td><td>{fmt(A.rmsVib)} / {fmt(B.rmsVib)}</td><td>{fmt(A.peak)} / {fmt(B.peak)}</td><td>{fmt(attenuationDb(A.rmsVib, B.rmsVib), 2)}</td><td>{fmt(interpCorrelation({ t: A.t, v: A.processed }, { t: B.t, v: B.processed }), 3)}</td></tr>
            ); })}
          </tbody></table>
          <p className="mt-2 text-[11px] text-muted-foreground">Reference sensor for attenuation elsewhere: S{ref.id}. Relative time delay and phase are not computed because sampling is not simultaneous.</p>
        </Panel>
      </>}
      <Historical exps={state.experiments} />
    </Page>
  );
}

function Historical({ exps }: { exps: Experiment[] }) {
  const st = useAnalysis("res").state.settings;
  const [sel, setSel] = useState<string[]>([]);
  const [res, setRes] = useState<{ e: Experiment; a: SensorAnalysis[] }[]>([]);
  const run = async () => {
    const out = [];
    for (const id of sel) { const e = exps.find((x) => x.id === id)!; const d = (await dbLoadDataset(id)) ?? []; out.push({ e, a: analyseDataset(d, st, "res", e.sensorLabels) }); }
    setRes(out);
  };
  const warn: string[] = [];
  if (res.length > 1) {
    const rates = res.map((r) => r.a.find((s) => isFinite(s.fs))?.fs ?? NaN);
    if (Math.max(...rates) - Math.min(...rates) > 0.1 * Math.min(...rates)) warn.push(`Sampling rates differ (${rates.map((r) => r.toFixed(1)).join(", ")} Hz).`);
    if (new Set(res.map((r) => JSON.stringify(r.e.sensorLabels))).size > 1) warn.push("Sensor location labels differ between experiments.");
    if (new Set(res.map((r) => r.e.source)).size > 1) warn.push("Experiments mix data sources (live/imported/demo).");
    if (new Set(res.map((r) => r.e.excitationWaveform)).size > 1) warn.push("Excitation configurations differ.");
  }
  const unit = unitLabel(st.displayUnit);
  const trend = { tooltip: { trigger: "axis" as const }, dataZoom: [], xAxis: { type: "category" as const, data: res.map((r) => r.e.id) }, yAxis: { type: "value" as const, name: `RMS (${unit})` },
    series: [1, 2, 3].map((id) => ({ name: `S${id}`, type: "line" as const, lineStyle: { color: css(`--sensor-${id}`) }, itemStyle: { color: css(`--sensor-${id}`) }, data: res.map((r) => (isFinite(r.a[id - 1].rmsVib) ? r.a[id - 1].rmsVib : null)) })) };
  return (
    <Panel title="Historical experiment comparison" right={<button className="btn btn-primary" disabled={sel.length < 2} onClick={run}>Compare {sel.length} selected</button>}>
      {!exps.length ? <Empty title="No saved experiments" /> : <div className="mb-3 flex flex-wrap gap-2">{exps.map((e) => (
        <label key={e.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><input type="checkbox" checked={sel.includes(e.id)} onChange={(v) => setSel(v.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />{e.id} · {e.title}</label>
      ))}</div>}
      {warn.map((w) => <div key={w} className="notice mb-2">Compatibility: {w} Differences may reflect configuration rather than mechanical response.</div>)}
      {res.length > 1 && <>
        <EChart option={trend} height={220} />
        <table className="tbl mt-2"><thead><tr><th>Experiment</th><th>Source</th><th>Rate (Hz)</th><th>Duration (s)</th>{[1, 2, 3].map((i) => <th key={i}>S{i} RMS / P-P / peak Hz</th>)}<th>Quality</th></tr></thead><tbody>
          {res.map(({ e, a }) => <tr key={e.id}><td>{e.id}</td><td className="font-sans">{e.source}</td><td>{fmt(a.find((s) => isFinite(s.fs))?.fs ?? NaN, 1)}</td><td>{fmt(Math.max(...a.map((s) => ((s.t.at(-1) ?? 0) - (s.t[0] ?? 0)) / 1000)), 2)}</td>{a.map((s) => <td key={s.id}>{fmt(s.rmsVib, 4)} / {fmt(s.p2p, 3)} / {s.peaks[0]?.freq.toFixed(2) ?? "—"}</td>)}<td className="font-sans">{a.map((s) => s.qualityStatus).join(", ")}</td></tr>)}
        </tbody></table>
      </>}
    </Panel>
  );
}
