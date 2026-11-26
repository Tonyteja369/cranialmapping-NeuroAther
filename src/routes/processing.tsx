import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EChart } from "@/components/nsx/EChart";
import { PeakTable } from "@/components/nsx/params";
import { AxisSelect, Empty, fmt, Page, Panel, SensorSelect, SourceTag } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { unitLabel } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";
import { addProcessingOp, updateSettings, useNsx } from "@/lib/nsx/store";
import type { Axis, SensorId, Settings } from "@/lib/nsx/types";

export const Route = createFileRoute("/processing")({
  head: head("Signal Processing", "Baseline removal, filtering, windowed FFT, peak detection, RMS and peak-to-peak on recorded data."),
  component: Processing,
});
const css = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : undefined);

function Processing() {
  const [sensor, setSensor] = useState<SensorId>(1);
  const [axis, setAxis] = useState<Axis>("res");
  const st = useNsx().settings;
  const { sensors, source, usingPreview } = useAnalysis(axis);
  const s = sensors[sensor - 1];
  const unit = unitLabel(st.displayUnit);
  const f = (p: Partial<Settings["filter"]>) => updateSettings({ filter: { ...st.filter, ...p } });
  const t0 = s.t[0] ?? 0;
  const timeOpt = { tooltip: { trigger: "axis" as const }, xAxis: { type: "value" as const, name: "Time (s)", nameLocation: "middle" as const, nameGap: 24, scale: true }, yAxis: { type: "value" as const, name: unit, scale: true },
    series: [{ name: "Raw", type: "line" as const, showSymbol: false, sampling: "lttb" as const, lineStyle: { width: 1, color: css("--muted-foreground") }, itemStyle: { color: css("--muted-foreground") }, data: s.t.map((t, i) => [(t - t0) / 1000, s.raw[i]]) },
      { name: "Processed", type: "line" as const, showSymbol: false, sampling: "lttb" as const, lineStyle: { width: 1, color: css(`--sensor-${sensor}`) }, itemStyle: { color: css(`--sensor-${sensor}`) }, data: s.t.map((t, i) => [(t - t0) / 1000, s.processed[i]]) }] };
  const fftOpt = s.sp ? { tooltip: { trigger: "axis" as const }, xAxis: { type: "value" as const, name: "Frequency (Hz)", nameLocation: "middle" as const, nameGap: 24 }, yAxis: { type: "value" as const, name: `Amplitude (${unit})` },
    series: [{ name: "Spectrum", type: "line" as const, showSymbol: false, lineStyle: { color: css("--analysis") }, itemStyle: { color: css("--analysis") }, data: s.sp.freq.map((x, i) => [x, s.sp!.mag[i]]), markPoint: { symbolSize: 30, data: s.peaks.slice(0, 4).map((p) => ({ coord: [p.freq, p.mag], value: p.freq.toFixed(2) })) } }] } : null;
  const record = () => { addProcessingOp(`Pipeline S${sensor}/${axis}`, { baseline: st.baseline, filter: st.filter, fftSize: st.fftSize, window: st.windowFn, peakThreshold: st.peakThreshold, fRange: [st.fMin, st.fMax] }); toast.success("Processing settings recorded in experiment log"); };
  const tooHigh = isFinite(s.fs) && st.filter.type !== "none" && st.filter.type !== "movingavg" && st.filter.cutoffHz >= s.fs / 2;
  return (
    <Page title="Signal Processing Laboratory" subtitle="Raw data are never modified; every result below is derived from a copy using the displayed settings." actions={<><SourceTag source={source} preview={usingPreview} /><button className="btn btn-primary" onClick={record}>Record settings to experiment</button></>}>
      <Panel title="Pipeline configuration">
        <div className="flex flex-wrap gap-3">
          <SensorSelect value={sensor} onChange={(v) => setSensor(v as SensorId)} />
          <AxisSelect value={axis} onChange={setAxis} />
          <label className="lbl">Baseline removal<select className="field" value={st.baseline} onChange={(e) => updateSettings({ baseline: e.target.value as Settings["baseline"] })}><option value="none">None</option><option value="mean">Mean subtraction</option><option value="linear">Linear detrend</option></select></label>
          <label className="lbl">Filter<select className="field" value={st.filter.type} onChange={(e) => f({ type: e.target.value as Settings["filter"]["type"] })}><option value="none">None</option><option value="lowpass">1st-order IIR low-pass</option><option value="highpass">1st-order IIR high-pass</option><option value="movingavg">Moving average</option></select></label>
          {(st.filter.type === "lowpass" || st.filter.type === "highpass") && <label className="lbl">Cutoff (Hz)<input className="field w-20" type="number" value={st.filter.cutoffHz} onChange={(e) => f({ cutoffHz: +e.target.value })} /></label>}
          {st.filter.type === "movingavg" && <label className="lbl">Taps<input className="field w-20" type="number" value={st.filter.taps} onChange={(e) => f({ taps: +e.target.value })} /></label>}
          <label className="lbl">FFT size<select className="field" value={st.fftSize} onChange={(e) => updateSettings({ fftSize: +e.target.value })}>{[64, 128, 256, 512, 1024, 2048].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="lbl">Window<select className="field" value={st.windowFn} onChange={(e) => updateSettings({ windowFn: e.target.value as Settings["windowFn"] })}><option value="hamming">Hamming</option><option value="hann">Hann</option><option value="rect">Rectangular</option></select></label>
          <label className="lbl">Peak threshold (% of max)<input className="field w-20" type="number" value={Math.round(st.peakThreshold * 100)} onChange={(e) => updateSettings({ peakThreshold: +e.target.value / 100 })} /></label>
          <label className="lbl">f min / max (Hz)<span className="flex gap-1"><input className="field w-16" type="number" value={st.fMin} onChange={(e) => updateSettings({ fMin: +e.target.value })} /><input className="field w-16" type="number" value={st.fMax} onChange={(e) => updateSettings({ fMax: +e.target.value })} /></span></label>
        </div>
        {tooHigh && <div className="notice mt-2">Filter cutoff is at or above the Nyquist frequency ({(s.fs / 2).toFixed(1)} Hz) — the filter is ineffective.</div>}
        {isFinite(s.fs) && st.fMax > s.fs / 2 && <div className="notice mt-2">Frequency range above {(s.fs / 2).toFixed(1)} Hz (Nyquist) is not measurable and is excluded.</div>}
      </Panel>
      {!s.series.length ? <Empty title="No data for this sensor" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6 text-xs">
            {[["Samples", s.q.n], ["Measured fs", `${fmt(s.fs, 2)} Hz`], ["Nyquist", `${fmt(s.fs / 2, 2)} Hz`], ["Δf", s.sp ? `${s.sp.df.toFixed(4)} Hz` : "—"], ["RMS (proc.)", `${fmt(s.rmsVib)} ${unit}`], ["P-P (proc.)", `${fmt(s.p2p)} ${unit}`]].map(([l, v]) => <div key={l as string} className="panel"><div className="panel-title">{l}</div><div className="font-mono text-sm font-semibold">{v}</div></div>)}
          </div>
          <div className="panel text-xs"><b>Validation:</b> {s.q.invalid} invalid values · {s.q.duplicates} duplicate timestamps · {s.q.nonMonotonic} out-of-order · ≈{s.q.gaps} missing samples · jitter {fmt(s.q.jitterPct, 1)}% · {s.q.saturated} near saturation. SNR is not reported: no defensible noise reference is defined for passive recordings.</div>
          <Panel title="Raw vs processed"><EChart option={timeOpt} height={280} /></Panel>
          <Panel title="Spectrum (processed, last N samples)">{fftOpt ? <EChart option={fftOpt} height={260} /> : <Empty title={`Need ≥ 16 samples (have ${s.q.n})`} />}</Panel>
          <PeakTable sensors={[s]} axis={axis} unit={unit} />
        </>
      )}
    </Page>
  );
}
