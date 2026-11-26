import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { EChart } from "./EChart";
import { HeadMap } from "./HeadMap";
import { AxisSelect, Empty, fmt, Panel, QualityTag, SensorSelect, SourceTag, SYNC_WARNING } from "./ui";
import { useAnalysis, datasetSpan, type SensorAnalysis } from "@/lib/nsx/analysis";
import { attenuationDb, dampingEstimate, frequencyResponse, msi, unitLabel } from "@/lib/nsx/dsp";
import { download, fname, toCsv } from "@/lib/nsx/io";
import { get, saveMeta, set, updateSettings } from "@/lib/nsx/store";
import type { Axis, SensorId } from "@/lib/nsx/types";

export const PARAMS = [
  { id: "resonance-frequency", n: 1, title: "Resonance Frequency" },
  { id: "vibration-amplitude", n: 2, title: "Vibration Amplitude" },
  { id: "frequency-response", n: 3, title: "Frequency Response" },
  { id: "mechanical-symmetry", n: 4, title: "Mechanical Symmetry" },
  { id: "damping-behaviour", n: 5, title: "Damping Behaviour" },
  { id: "resonance-profile", n: 6, title: "Mechanical Resonance Profile" },
] as const;
export type ParamId = (typeof PARAMS)[number]["id"];

/* ---------------- shared helpers ---------------- */
function Spark({ ys, color = "var(--sensor-1)", markX }: { ys: number[]; color?: string; markX?: number }) {
  const W = 150, H = 44;
  const f = ys.filter(isFinite);
  if (f.length < 2) return <div className="grid h-[44px] place-items-center text-[10px] text-muted-foreground">no data</div>;
  const min = Math.min(...f), max = Math.max(...f), r = max - min || 1;
  const step = Math.max(1, Math.floor(ys.length / 150));
  const pts: string[] = [];
  for (let i = 0; i < ys.length; i += step) if (isFinite(ys[i])) pts.push(`${((i / (ys.length - 1)) * W).toFixed(1)},${(H - 2 - ((ys[i] - min) / r) * (H - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[44px] w-full" preserveAspectRatio="none">
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} stroke="var(--border)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      {markX !== undefined && <line x1={markX * W} x2={markX * W} y1="0" y2={H} stroke="var(--analysis)" strokeDasharray="2 2" />}
    </svg>
  );
}

const csvBtn = (onClick: () => void, label = "CSV") => (
  <button className="btn" onClick={onClick}><Download className="h-3.5 w-3.5" />{label}</button>
);

function Header({ sensors, source, preview, extra }: { sensors: SensorAnalysis[]; source: ReturnType<typeof useAnalysis>["source"]; preview: boolean; extra?: React.ReactNode }) {
  const s0 = sensors.find((s) => s.series.length);
  const n = s0?.sp?.n;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <SourceTag source={source} preview={preview} />
      {sensors.map((s) => (
        <span key={s.id} className="tag tag-muted">S{s.id}: {isFinite(s.fs) ? `${s.fs.toFixed(1)} Hz meas.` : "—"} · N={s.series.length}</span>
      ))}
      {n && s0 && <span className="tag tag-muted">FFT {n} · Δf {(s0.fs / n).toFixed(4)} Hz · Nyquist {(s0.fs / 2).toFixed(1)} Hz</span>}
      {extra}
    </div>
  );
}

function useCtx(axis: Axis) {
  const a = useAnalysis(axis);
  const unit = unitLabel(a.state.settings.displayUnit);
  const span = datasetSpan(a.samples);
  return { ...a, unit, span };
}

/* ---------------- Strip ---------------- */
export function MeasuredParametersStrip() {
  const { sensors, state, unit } = useCtx("res");
  const exp = state.experiment;
  const best = sensors.reduce<SensorAnalysis | null>((b, s) => (s.peaks[0] && (!b || s.peaks[0].mag > (b.peaks[0]?.mag ?? 0)) ? s : b), null);
  const amp = sensors.find((s) => s.series.length);
  const steps = exp?.sweepSteps ?? [];
  const fr = amp && steps.length ? frequencyResponse(amp.series, "res", steps, amp.fs / 2) : [];
  const [pa, pb] = state.settings.msiPair;
  const A = sensors[pa - 1], B = sensors[pb - 1];
  const m = msi(state.settings.msiMetric === "rms" ? A.rmsVib : A.peak, state.settings.msiMetric === "rms" ? B.rmsVib : B.peak);
  const damp = amp && exp?.decayStartMs != null ? dampingEstimate(amp.t, amp.processed, exp.decayStartMs) : null;
  const cells: { id: ParamId; value: string; sub: string; spark: React.ReactNode }[] = [
    {
      id: "resonance-frequency",
      value: best ? `${best.peaks[0].freq.toFixed(2)} Hz` : "—",
      sub: best ? `Candidate spectral peak · S${best.id}` : "No spectrum",
      spark: <Spark ys={best?.sp?.mag ?? []} color="var(--analysis)" markX={best?.sp ? best.peaks[0].freq / best.sp.nyquist : undefined} />,
    },
    {
      id: "vibration-amplitude",
      value: amp ? `${fmt(amp.rmsVib, 4)} ${unit}` : "—",
      sub: amp ? `RMS · S${amp.id} · p-p ${fmt(amp.p2p, 3)}` : "No samples",
      spark: <Spark ys={amp?.processed.slice(-400) ?? []} />,
    },
    {
      id: "frequency-response",
      value: fr.length ? `${fr.filter((r) => isFinite(r.rms)).length}/${fr.length} steps` : "Not available",
      sub: fr.length ? "Stepped-sine response" : "No verified excitation data",
      spark: <Spark ys={fr.map((r) => r.rms)} color="var(--sensor-2)" />,
    },
    {
      id: "mechanical-symmetry",
      value: isFinite(m) ? m.toFixed(3) : "—",
      sub: `MSI (S${pa} vs S${pb}, ${state.settings.msiMetric.toUpperCase()})`,
      spark: <Bars vals={sensors.map((s) => s.rmsVib)} />,
    },
    {
      id: "damping-behaviour",
      value: damp?.ok ? `ζ ≈ ${damp.zeta.toFixed(4)}` : "—",
      sub: damp ? (damp.ok ? `log-decrement · R² ${damp.r2.toFixed(2)}` : "Insufficient data") : "Decay start not set",
      spark: <Spark ys={damp?.peaks?.map((p) => p.a) ?? []} color="var(--sensor-3)" />,
    },
    {
      id: "resonance-profile",
      value: `${sensors.filter((s) => s.series.length).length}/3 sensors`,
      sub: "Three-location response",
      spark: <MiniHead vals={sensors.map((s) => s.rmsVib)} />,
    },
  ];
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="panel-title">Measured Parameters</h2>
        <span className="text-[10px] text-muted-foreground">Resultant axis · processed signal · click a parameter for analysis</span>
      </div>
      <div className="params-strip">
        {cells.map((c, i) => (
          <Link key={c.id} to="/parameters/$param" params={{ param: c.id }} className="param-cell border-b xl:border-b-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{i + 1}. {PARAMS[i].title}</div>
            {c.spark}
            <div className="font-mono text-sm font-semibold">{c.value}</div>
            <div className="truncate text-[10px] text-muted-foreground">{c.sub}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
function Bars({ vals }: { vals: number[] }) {
  const max = Math.max(...vals.filter(isFinite), 0);
  return (
    <div className="flex h-[44px] items-end gap-3 px-6">
      {vals.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-sm" style={{ height: max && isFinite(v) ? `${(v / max) * 100}%` : "2px", background: `var(--sensor-${i + 1})` }} />
      ))}
    </div>
  );
}
function MiniHead({ vals }: { vals: number[] }) {
  const max = Math.max(...vals.filter(isFinite), 0);
  const pos = [[22, 22], [58, 22], [40, 40]];
  return (
    <svg viewBox="0 0 80 44" className="h-[44px] w-full">
      <ellipse cx="40" cy="24" rx="26" ry="19" fill="var(--secondary)" stroke="var(--panel-border)" />
      {vals.map((v, i) => <circle key={i} cx={pos[i][0]} cy={pos[i][1]} r={max && isFinite(v) ? 2 + 5 * (v / max) : 1.5} fill={`var(--sensor-${i + 1})`} fillOpacity="0.7" />)}
    </svg>
  );
}

/* ---------------- 1. Resonance frequency ---------------- */
export function ResonanceFrequencyView() {
  const [sensor, setSensor] = useState<SensorId | "all">("all");
  const [axis, setAxis] = useState<Axis>("res");
  const { sensors, source, usingPreview, state, unit } = useCtx(axis);
  const shown = sensor === "all" ? sensors : sensors.filter((s) => s.id === sensor);
  const avail = shown.filter((s) => s.sp);
  const option = useMemo(() => ({
    tooltip: { trigger: "axis" as const, valueFormatter: (v: unknown) => `${fmt(Number(v), 5)} ${unit}` },
    xAxis: { type: "value" as const, name: "Frequency (Hz)", nameLocation: "middle" as const, nameGap: 24, min: 0, max: Math.max(...avail.map((s) => s.sp!.nyquist), 1) },
    yAxis: { type: "value" as const, name: `Amplitude (${unit})` },
    series: avail.map((s) => ({
      name: `S${s.id} ${s.label}`, type: "line" as const, showSymbol: false, color: `var(--sensor-${s.id})`,
      lineStyle: { width: 1.4, color: getC(s.id) }, itemStyle: { color: getC(s.id) },
      data: s.sp!.freq.map((f, i) => [f, s.sp!.mag[i]]),
      markPoint: { symbolSize: 34, label: { fontSize: 9, formatter: (p: { value: number }) => `${p.value}` }, data: s.peaks.slice(0, 3).map((p) => ({ coord: [p.freq, p.mag], value: p.freq.toFixed(2) })) },
      markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed" as const, color: getC(s.id) }, data: s.peaks[0] ? [{ yAxis: s.peaks[0].threshold, name: "threshold" }] : [] },
    })),
  }), [avail, unit]);
  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    avail.forEach((s) => s.sp!.freq.forEach((f, i) => rows.push([s.id, axis, f, s.sp!.mag[i]])));
    download(fname(state.experiment, "FFT", "csv"), toCsv(["sensor_id", "axis", "frequency_Hz", `amplitude_${state.settings.displayUnit}`], rows), "text/csv");
  };
  const hasExcitation = (state.experiment?.sweepSteps.some((s) => s.verified) ?? false) || state.experiment?.excitationHz != null;
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      <Panel title="Amplitude spectrum" right={<><SensorSelect value={sensor} onChange={setSensor} allowAll /><AxisSelect value={axis} onChange={setAxis} />{csvBtn(exportCsv)}</>}>
        {avail.length ? <EChart option={option} height={340} /> : <Empty title="No spectrum available">At least 16 samples per sensor with valid timestamps are needed. Connect the ESP32, import a CSV or open a saved experiment.</Empty>}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Single-sided amplitude spectrum A = 2|X(k)|/Σw of the last N processed samples (mean removed, {state.settings.windowFn} window). Peaks: local maxima ≥ {Math.round(state.settings.peakThreshold * 100)}% of the in-band maximum, {state.settings.fMin}–{state.settings.fMax} Hz, DC excluded. Frequencies above the Nyquist limit cannot be measured and are not shown.
        </p>
      </Panel>
      <div className={hasExcitation ? "notice-info" : "notice"}>
        {hasExcitation
          ? "This experiment documents an excitation. Peaks are still candidate resonances until the response is confirmed across a controlled sweep."
          : "No controlled excitation is documented for this dataset. Peaks are candidate spectral peaks only — they may come from environmental vibration, sensor mounting, the fixture, or the source. They are not confirmed mechanical resonances."}
        {" "}The transducer's specified ~1,600 Hz resonance is a property of the transducer, not the test object, and lies far above the current acquisition Nyquist limit.
      </div>
      <PeakTable sensors={avail} axis={axis} unit={unit} />
    </div>
  );
}
const getC = (id: number) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(`--sensor-${id}`).trim() : undefined);

export function PeakTable({ sensors, axis, unit }: { sensors: SensorAnalysis[]; axis: Axis; unit: string }) {
  const rows = sensors.flatMap((s) => s.peaks.map((p) => ({ s, p })));
  return (
    <Panel title="Detected spectral peaks (candidates)">
      {rows.length ? (
        <table className="tbl">
          <thead><tr><th>Sensor</th><th>Axis</th><th>Frequency (Hz)</th><th>Amplitude ({unit})</th><th>Threshold ({unit})</th><th>Interval (s)</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ s, p }, i) => (
              <tr key={i}><td>S{s.id}</td><td>{axis}</td><td>{p.freq.toFixed(3)}</td><td>{fmt(p.mag, 5)}</td><td>{fmt(p.threshold, 5)}</td>
                <td>{s.sp ? `${((s.t.at(-s.sp.n)! - s.t[0]) / 1000).toFixed(2)}–${((s.t.at(-1)! - s.t[0]) / 1000).toFixed(2)}` : "—"}</td><td className="font-sans">candidate</td></tr>
            ))}
          </tbody>
        </table>
      ) : <Empty title="No peaks above threshold" />}
    </Panel>
  );
}

/* ---------------- 2. Vibration amplitude ---------------- */
export function VibrationAmplitudeView() {
  const [sensor, setSensor] = useState<SensorId | "all">(1);
  const [mode, setMode] = useState<"processed" | "raw" | "both">("both");
  const [win, setWin] = useState(0);
  const ax = useCtx("ax"), ay = useCtx("ay"), az = useCtx("az");
  const { sensors, source, usingPreview, state, unit } = useCtx("res");
  const t0 = useMemo(() => Math.min(...sensors.filter((s) => s.t.length).map((s) => s.t[0]), Infinity), [sensors]);
  const cut = (s: SensorAnalysis) => {
    if (!win || !s.t.length) return 0;
    const end = s.t.at(-1)! - win * 1000;
    const i = s.t.findIndex((t) => t >= end);
    return i < 0 ? 0 : i;
  };
  const series: object[] = [];
  const add = (name: string, s: SensorAnalysis, vals: number[], color?: string, dashed = false) => {
    const c = cut(s);
    series.push({ name, type: "line", showSymbol: false, sampling: "lttb", lineStyle: { width: 1.1, type: dashed ? "dashed" : "solid", color }, itemStyle: { color }, data: s.t.slice(c).map((t, i) => [(t - t0) / 1000, vals[c + i]]) });
  };
  if (sensor === "all") sensors.forEach((s) => s.t.length && add(`S${s.id} resultant (${mode === "raw" ? "raw" : "processed"})`, s, mode === "raw" ? s.raw : s.processed, getC(s.id)));
  else {
    const i = sensor - 1;
    const s = sensors[i];
    if (s.t.length) {
      if (mode !== "processed") { add("X raw", ax.sensors[i], ax.sensors[i].raw, getC(1)); add("Y raw", ay.sensors[i], ay.sensors[i].raw, getC(2)); add("Z raw", az.sensors[i], az.sensors[i].raw, getC(3)); add("Resultant raw", s, s.raw, undefined, true); }
      if (mode !== "raw") add("Resultant processed", s, s.processed, getComputedStyleSafe("--analysis"));
    }
  }
  const option = { tooltip: { trigger: "axis" as const, axisPointer: { type: "cross" as const } }, xAxis: { type: "value" as const, name: "Time (s)", nameLocation: "middle" as const, nameGap: 24, scale: true }, yAxis: { type: "value" as const, name: `Acceleration (${unit})`, scale: true }, series };
  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    sensors.forEach((s, i) => s.t.forEach((t, k) => rows.push([t, s.id, ax.sensors[i].raw[k], ay.sensors[i].raw[k], az.sensors[i].raw[k], s.raw[k], s.processed[k]])));
    const u = state.settings.displayUnit;
    download(fname(state.experiment, "Processed", "csv"), toCsv(["timestamp_ms", "sensor_id", `ax_raw_${u}`, `ay_raw_${u}`, `az_raw_${u}`, `resultant_raw_${u}`, `resultant_processed_${u}`], rows), "text/csv");
  };
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      <Panel title="Acceleration waveform" right={<>
        <SensorSelect value={sensor} onChange={setSensor} allowAll />
        <label className="lbl">Signal<select className="field" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="both">Raw + processed</option><option value="raw">Raw only</option><option value="processed">Processed only</option></select></label>
        <label className="lbl">Window<select className="field" value={win} onChange={(e) => setWin(+e.target.value)}><option value={0}>Full</option><option value={2}>Last 2 s</option><option value={5}>Last 5 s</option><option value={10}>Last 10 s</option><option value={30}>Last 30 s</option></select></label>
        {csvBtn(exportCsv)}</>}>
        {series.length ? <EChart option={option} height={360} /> : <Empty title="No waveform data" />}
        <p className="mt-2 text-[11px] text-muted-foreground">Raw = values as received (gravity included). Processed = resultant with baseline removal “{state.settings.baseline}” and filter “{state.settings.filter.type}” (configure in Signal Processing). Cross-hair cursor shows exact time and value; scroll to zoom, drag to pan.</p>
      </Panel>
      <Panel title="Amplitude metrics (resultant)">
        <table className="tbl">
          <thead><tr><th>Sensor</th><th>Label</th><th>RMS raw ({unit})</th><th>RMS vibration ({unit})</th><th>Peak |a| ({unit})</th><th>Peak-to-peak ({unit})</th><th>Quality</th></tr></thead>
          <tbody>{sensors.map((s) => <tr key={s.id}><td>S{s.id}</td><td className="font-sans">{s.label}</td><td>{fmt(s.rmsRaw)}</td><td>{fmt(s.rmsVib)}</td><td>{fmt(s.peak)}</td><td>{fmt(s.p2p)}</td><td><QualityTag status={s.qualityStatus} /></td></tr>)}</tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted-foreground">RMS = √(Σx²/N). Peak-to-peak = max(x) − min(x). Vibration metrics are computed on the processed signal; raw RMS includes the gravity/baseline component.</p>
      </Panel>
    </div>
  );
}
const getComputedStyleSafe = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : undefined);

/* ---------------- 3. Frequency response ---------------- */
export function FrequencyResponseView() {
  const [axis, setAxis] = useState<Axis>("res");
  const { sensors, source, usingPreview, state, unit } = useCtx(axis);
  const steps = state.experiment?.sweepSteps ?? [];
  const results = sensors.map((s) => ({ s, r: s.series.length ? frequencyResponse(s.series, axis, steps, s.fs / 2) : [] }));
  const conv = state.settings.displayUnit === "ms2" ? 9.80665 : 1;
  if (!steps.length) {
    return (
      <div className="flex flex-col gap-4">
        <Header sensors={sensors} source={source} preview={usingPreview} />
        <div className="notice">A validated frequency-response curve cannot be calculated: this dataset has no documented excitation steps (excitation frequency associated with a steady-state response interval). Define stepped-sine intervals on the <Link to="/sweep" className="underline">Frequency Sweep</Link> page. The available amplitude spectrum is shown instead — it is not a frequency response.</div>
        <ResonanceFrequencyView />
      </div>
    );
  }
  const option = {
    tooltip: { trigger: "axis" as const },
    xAxis: { type: "value" as const, name: "Excitation frequency (Hz)", nameLocation: "middle" as const, nameGap: 24, scale: true },
    yAxis: { type: "value" as const, name: `Response RMS (${unit})` },
    series: results.map(({ s, r }) => ({ name: `S${s.id}`, type: "line" as const, symbolSize: 6, lineStyle: { color: getC(s.id) }, itemStyle: { color: getC(s.id) }, data: r.filter((x) => isFinite(x.rms)).map((x) => [x.freq, x.rms * conv]) })),
  };
  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    results.forEach(({ s, r }) => r.forEach((x) => rows.push([s.id, axis, x.requested, x.actual ?? "", x.rms * conv, x.n, x.status])));
    download(fname(state.experiment, "FrequencyResponse", "csv"), toCsv(["sensor_id", "axis", "requested_Hz", "actual_Hz", `response_rms_${state.settings.displayUnit}`, "n_samples", "status"], rows), "text/csv");
  };
  const unverified = steps.some((s) => !s.verified);
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      {unverified && <div className="notice">Some steps have unverified excitation (not reported by firmware or confirmed by the operator). Treat those points as provisional.</div>}
      <Panel title="Stepped-sine frequency response" right={<><AxisSelect value={axis} onChange={setAxis} />{csvBtn(exportCsv)}</>}>
        <EChart option={option} height={320} />
        <p className="mt-2 text-[11px] text-muted-foreground">Response = RMS of the mean-removed {axis} acceleration within each documented steady-state interval. Steps at or above the Nyquist limit are rejected.</p>
      </Panel>
      <Panel title="Response amplitude table">
        <table className="tbl">
          <thead><tr><th>Step</th><th>Requested (Hz)</th><th>Actual (Hz)</th><th>Interval (ms)</th>{sensors.map((s) => <th key={s.id}>S{s.id} ({unit})</th>)}<th>Status</th></tr></thead>
          <tbody>{steps.map((st, i) => (
            <tr key={i}><td>{i + 1}</td><td>{st.requestedHz}</td><td>{st.actualHz ?? "unknown"}</td><td>{st.tStartMs}–{st.tEndMs}</td>{results.map(({ s, r }) => <td key={s.id}>{fmt((r[i]?.rms ?? NaN) * conv)}</td>)}<td className="font-sans">{results.find((x) => x.r[i])?.r[i].status}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ---------------- 4. Mechanical symmetry ---------------- */
export function MechanicalSymmetryView() {
  const { sensors, source, usingPreview, state, unit } = useCtx("res");
  const st = state.settings;
  const [freq, setFreq] = useState<number | "">("");
  const atF = (s: SensorAnalysis) => {
    if (!s.sp || freq === "") return NaN;
    const k = Math.round(Number(freq) / s.sp.df);
    return k > 0 && k < s.sp.mag.length ? s.sp.mag[k] : NaN;
  };
  const metric = (s: SensorAnalysis) => (st.msiMetric === "rms" ? s.rmsVib : s.peak);
  const [a, b] = st.msiPair;
  const val = msi(metric(sensors[a - 1]), metric(sensors[b - 1]));
  const pa = st.sensorPositions[a], pb = st.sensorPositions[b];
  const bilateral = (pa.startsWith("left") && pb.startsWith("right") && pa.slice(5) === pb.slice(6)) || (pb.startsWith("left") && pa.startsWith("right") && pb.slice(5) === pa.slice(6));
  const ref = sensors[st.referenceSensor - 1];
  const dims = ["RMS", "Peak", "Selected f"];
  const raw = sensors.map((s) => [s.rmsVib, s.peak, atF(s)]);
  const maxes = dims.map((_, j) => Math.max(...raw.map((r) => r[j]).filter(isFinite), 0));
  const option = {
    tooltip: { trigger: "item" as const }, dataZoom: [], toolbox: undefined,
    radar: { indicator: dims.map((d) => ({ name: d, max: 1 })), radius: "65%" },
    series: [{ type: "radar" as const, data: sensors.map((s, i) => ({ name: `S${s.id}`, value: raw[i].map((v, j) => (maxes[j] && isFinite(v) ? v / maxes[j] : 0)), lineStyle: { color: getC(s.id) }, itemStyle: { color: getC(s.id) }, areaStyle: { opacity: 0.08 } })) }],
  };
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title="Sensor locations">
          <HeadMap values={sensors.map((s) => ({ id: s.id, label: s.label, value: metric(s), quality: s.qualityStatus }))} positions={st.sensorPositions} unit={unit} metricName={st.msiMetric === "rms" ? "RMS vibration" : "Peak |a|"} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Mechanical Symmetry Index (project-defined)" right={<>
            <label className="lbl">Pair<select className="field" value={`${a}-${b}`} onChange={(e) => updateSettings({ msiPair: e.target.value.split("-").map(Number) as [SensorId, SensorId] })}><option value="1-2">S1 vs S2</option><option value="2-3">S2 vs S3</option><option value="1-3">S1 vs S3</option></select></label>
            <label className="lbl">Metric<select className="field" value={st.msiMetric} onChange={(e) => updateSettings({ msiMetric: e.target.value as "rms" | "peak" })}><option value="rms">RMS vibration</option><option value="peak">Peak |a|</option></select></label></>}>
            <div className="flex items-baseline gap-3"><span className="metric text-3xl">{bilateral && isFinite(val) ? val.toFixed(3) : "—"}</span><span className="text-xs text-muted-foreground">dimensionless, 0–1</span></div>
            <p className="mt-2 text-[11px] text-muted-foreground">MSI = 1 − |A − B| / (A + B), where A and B are the selected metric at the two paired sensors. 1 = equal response; 0 = one location silent. Assumes the paired sensors are at mirror-image positions with identical mounting. This is a project-defined research metric, not an established clinical measure.</p>
            {!bilateral && <div className="notice mt-2">The selected pair ({pa} / {pb}) is not a left/right mirror pair, so a symmetry score is not supported. Assign mirror-image positions in Settings or choose another pair.</div>}
          </Panel>
          <Panel title="Normalized comparison" right={<label className="lbl">Selected f (Hz)<input className="field w-24" type="number" value={freq} onChange={(e) => setFreq(e.target.value === "" ? "" : +e.target.value)} placeholder="e.g. 12.5" /></label>}>
            <EChart option={option} height={260} />
            <table className="tbl mt-2">
              <thead><tr><th>Sensor</th><th>RMS ({unit})</th><th>Peak ({unit})</th><th>|A(f)| ({unit})</th><th>Δ vs ref S{st.referenceSensor} (dB)</th></tr></thead>
              <tbody>{sensors.map((s, i) => <tr key={s.id}><td>S{s.id}</td><td>{fmt(raw[i][0])}</td><td>{fmt(raw[i][1])}</td><td>{fmt(raw[i][2])}</td><td>{fmt(attenuationDb(ref.rmsVib, s.rmsVib), 2)}</td></tr>)}</tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">Attenuation SA = 20·log₁₀(RMS_ref / RMS_i) using RMS vibration. {SYNC_WARNING}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 5. Damping ---------------- */
export function DampingView() {
  const [sensor, setSensor] = useState<SensorId | "all">(1);
  const [axis, setAxis] = useState<Axis>("res");
  const { sensors, source, usingPreview, state, unit, span } = useCtx(axis);
  const exp = state.experiment;
  const s = sensors[(sensor === "all" ? 1 : sensor) - 1];
  const [startS, setStartS] = useState<string>(exp?.decayStartMs != null && span ? String((exp.decayStartMs - span.startMs) / 1000) : "");
  const t0 = span?.startMs ?? 0;
  const startMs = exp?.decayStartMs ?? null;
  const est = startMs != null && s.t.length ? dampingEstimate(s.t, s.processed, startMs) : null;
  const applyStart = async () => {
    if (!exp) return;
    const v = startS === "" ? null : t0 + Number(startS) * 1000;
    const next = { ...exp, decayStartMs: v };
    if (get().experiments.some((e) => e.id === exp.id)) await saveMeta(next); else set({ experiment: next });
  };
  const idx = startMs != null ? Math.max(0, s.t.findIndex((t) => t >= startMs)) : 0;
  const option = est ? {
    tooltip: { trigger: "axis" as const },
    xAxis: { type: "value" as const, name: "Time (s)", nameLocation: "middle" as const, nameGap: 24, scale: true },
    yAxis: { type: "value" as const, name: `Acceleration (${unit})`, scale: true },
    series: [
      { name: "Processed signal", type: "line" as const, showSymbol: false, lineStyle: { width: 1, color: getC(s.id) }, itemStyle: { color: getC(s.id) }, data: s.t.slice(idx).map((t, i) => [(t - t0) / 1000, s.processed[idx + i]]) },
      { name: "Successive peaks", type: "scatter" as const, symbolSize: 6, itemStyle: { color: getComputedStyleSafe("--analysis") }, data: (est.peaks ?? []).map((p) => [(p.t - t0) / 1000, p.a]) },
      ...(est.ok ? [{ name: "Fitted envelope", type: "line" as const, showSymbol: false, lineStyle: { type: "dashed" as const, color: getComputedStyleSafe("--analysis") }, data: est.peaks.map((p) => [(p.t - t0) / 1000, est.envelope(p.t / 1000)]) }] : []),
    ],
  } : null;
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      <Panel title="Free-decay analysis" right={<>
        <SensorSelect value={sensor} onChange={setSensor} /><AxisSelect value={axis} onChange={setAxis} />
        <label className="lbl">Excitation end (s)<input className="field w-24" type="number" step="0.01" value={startS} onChange={(e) => setStartS(e.target.value)} disabled={!exp} /></label>
        <button className="btn btn-primary" onClick={applyStart} disabled={!exp}>Set decay start</button></>}>
        {!exp && <div className="notice mb-2">Open or create an experiment to document when excitation ended.</div>}
        {startMs == null ? (
          <Empty title="Insufficient data for damping estimation.">Damping is only estimated from a documented free-decay response after excitation ends. Enter the time (relative to the start of the recording) at which excitation stopped.</Empty>
        ) : !est?.ok ? (
          <>
            <Empty title="Insufficient data for damping estimation.">{est?.reason}</Empty>
            {option && <EChart option={option} height={260} />}
          </>
        ) : (
          <>
            {option && <EChart option={option} height={320} />}
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat l="Damping ratio ζ" v={est.zeta.toFixed(5)} />
              <Stat l="Log decrement δ" v={est.delta.toFixed(4)} />
              <Stat l="Decay rate σ" v={`${est.decayRate.toFixed(3)} 1/s`} />
              <Stat l="Damped freq f_d" v={`${est.fd.toFixed(3)} Hz`} />
              <Stat l="Fit R²" v={est.r2.toFixed(3)} />
            </div>
          </>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Method: successive positive peaks of the mean-removed processed signal after the decay start; linear fit of ln(peak) vs time gives σ; δ = σ·T_d; ζ = δ / √(4π² + δ²). Requires ≥ 4 peaks, decreasing envelope and R² ≥ 0.80. Assumes single-mode, lightly damped linear response; at 100 Hz sampling peak timing has ±½-sample uncertainty.</p>
      </Panel>
    </div>
  );
}
const Stat = ({ l, v }: { l: string; v: string }) => <div className="rounded-md border p-2"><div className="text-[10px] text-muted-foreground">{l}</div><div className="font-mono text-sm font-semibold">{v}</div></div>;

/* ---------------- 6. Profile ---------------- */
export type MapMetric = "rms" | "peak" | "freq" | "band" | "relative";
export function useMapValues(metric: MapMetric, freq: number, band: [number, number]) {
  const ctx = useCtx("res");
  const { sensors, state } = ctx;
  const ref = sensors[state.settings.referenceSensor - 1];
  const vals = sensors.map((s) => {
    let v = NaN;
    if (metric === "rms") v = s.rmsVib;
    else if (metric === "peak") v = s.peak;
    else if (metric === "freq" && s.sp) { const k = Math.round(freq / s.sp.df); v = k > 0 && k < s.sp.mag.length ? s.sp.mag[k] : NaN; }
    else if (metric === "band" && s.sp) { let e = 0; s.sp.freq.forEach((f, i) => { if (f >= band[0] && f <= band[1]) e += s.sp!.mag[i] ** 2; }); v = Math.sqrt(e / 2); }
    else if (metric === "relative") v = ref.rmsVib > 0 ? s.rmsVib / ref.rmsVib : NaN;
    return { id: s.id, label: s.label, value: v, quality: s.qualityStatus };
  });
  const unitFor = metric === "relative" ? "ratio" : ctx.unit;
  const names: Record<MapMetric, string> = { rms: "RMS vibration acceleration", peak: "Peak |a|", freq: `Spectral amplitude at ${freq} Hz`, band: `Band RMS ${band[0]}–${band[1]} Hz (from spectrum)`, relative: `RMS relative to S${state.settings.referenceSensor}` };
  return { ...ctx, vals, unitFor, name: names[metric] };
}

export function MapControls({ metric, setMetric, freq, setFreq, band, setBand }: { metric: MapMetric; setMetric: (m: MapMetric) => void; freq: number; setFreq: (f: number) => void; band: [number, number]; setBand: (b: [number, number]) => void }) {
  return (
    <>
      <label className="lbl">Displayed metric<select className="field" value={metric} onChange={(e) => setMetric(e.target.value as MapMetric)}><option value="rms">RMS acceleration</option><option value="peak">Peak acceleration</option><option value="freq">Selected-frequency response</option><option value="band">Frequency-band response</option><option value="relative">Relative sensor response</option></select></label>
      {metric === "freq" && <label className="lbl">f (Hz)<input className="field w-20" type="number" value={freq} onChange={(e) => setFreq(+e.target.value)} /></label>}
      {metric === "band" && <label className="lbl">Band (Hz)<span className="flex gap-1"><input className="field w-16" type="number" value={band[0]} onChange={(e) => setBand([+e.target.value, band[1]])} /><input className="field w-16" type="number" value={band[1]} onChange={(e) => setBand([band[0], +e.target.value])} /></span></label>}
    </>
  );
}

export function ResonanceProfileView() {
  const [metric, setMetric] = useState<MapMetric>("rms");
  const [freq, setFreq] = useState(12.5);
  const [band, setBand] = useState<[number, number]>([1, 20]);
  const m = useMapValues(metric, freq, band);
  const { sensors, source, usingPreview, state, unit } = m;
  const [a, b] = state.settings.msiPair;
  const msiV = msi(sensors[a - 1].rmsVib, sensors[b - 1].rmsVib);
  const exp = state.experiment;
  const damp = exp?.decayStartMs != null ? sensors.map((s) => (s.t.length ? dampingEstimate(s.t, s.processed, exp.decayStartMs!) : null)) : null;
  const fr = exp?.sweepSteps.length ? sensors.map((s) => frequencyResponse(s.series, "res", exp.sweepSteps, s.fs / 2)) : null;
  return (
    <div className="flex flex-col gap-4">
      <Header sensors={sensors} source={source} preview={usingPreview} />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Panel title="Three-location response" right={<MapControls {...{ metric, setMetric, freq, setFreq, band, setBand }} />}>
          <HeadMap values={m.vals} positions={state.settings.sensorPositions} unit={m.unitFor} metricName={m.name} />
        </Panel>
        <Panel title="Consolidated profile">
          <table className="tbl">
            <thead><tr><th>Parameter</th>{sensors.map((s) => <th key={s.id}>S{s.id} · {s.label}</th>)}</tr></thead>
            <tbody>
              <tr><td className="font-sans">RMS vibration ({unit})</td>{sensors.map((s) => <td key={s.id}>{fmt(s.rmsVib)}</td>)}</tr>
              <tr><td className="font-sans">Peak |a| ({unit})</td>{sensors.map((s) => <td key={s.id}>{fmt(s.peak)}</td>)}</tr>
              <tr><td className="font-sans">Peak-to-peak ({unit})</td>{sensors.map((s) => <td key={s.id}>{fmt(s.p2p)}</td>)}</tr>
              <tr><td className="font-sans">Dominant candidate peak (Hz)</td>{sensors.map((s) => <td key={s.id}>{s.peaks[0] ? s.peaks[0].freq.toFixed(3) : "—"}</td>)}</tr>
              <tr><td className="font-sans">Candidate peak count</td>{sensors.map((s) => <td key={s.id}>{s.sp ? s.peaks.length : "—"}</td>)}</tr>
              <tr><td className="font-sans">Frequency response</td>{sensors.map((s, i) => <td key={s.id}>{fr ? `${fr[i].filter((x) => isFinite(x.rms)).length} valid steps` : "not available"}</td>)}</tr>
              <tr><td className="font-sans">Damping ratio ζ</td>{sensors.map((s, i) => <td key={s.id}>{damp?.[i]?.ok ? (damp[i] as { zeta: number }).zeta.toFixed(5) : "insufficient data"}</td>)}</tr>
              <tr><td className="font-sans">Measured rate (Hz)</td>{sensors.map((s) => <td key={s.id}>{fmt(s.fs, 2)}</td>)}</tr>
              <tr><td className="font-sans">Data quality</td>{sensors.map((s) => <td key={s.id}><QualityTag status={s.qualityStatus} /></td>)}</tr>
            </tbody>
          </table>
          <div className="mt-3 text-xs">MSI (S{a}/S{b}, RMS): <b className="font-mono">{isFinite(msiV) ? msiV.toFixed(3) : "—"}</b> <span className="text-muted-foreground">(project-defined; validity depends on mirror-image placement — see Mechanical Symmetry)</span></div>
          <div className="notice mt-3">Three sensors measure response at three surface points only. This profile does not describe the whole skull, internal anatomy, or any pathology.</div>
        </Panel>
      </div>
      <ResonanceFrequencyView />
    </div>
  );
}
