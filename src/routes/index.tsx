import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { EChart } from "@/components/nsx/EChart";
import { MeasuredParametersStrip } from "@/components/nsx/params";
import { DemoButton, ImportCsvButton } from "@/components/nsx/DataActions";
import { Empty, fmt, Metric, Page, Panel, QualityTag, SourceTag, NO_MEDICAL } from "@/components/nsx/ui";
import { Skull3D } from "@/components/nsx/Skull3D";
import { datasetSpan, useAnalysis, type SensorAnalysis } from "@/lib/nsx/analysis";
import { unitLabel } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";
import { useSensorStreams } from "@/lib/nsx/sensor-stream";
import { openExperiment } from "@/lib/nsx/store";

export const Route = createFileRoute("/")({
  head: head("Overview", "Live overview of ESP32 connection, three MPU6050 sensors, measured parameters and recent experiments."),
  component: Overview,
});

const css = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : undefined);

export function waveOption(s: SensorAnalysis[], unit: string, which: "processed" | "raw" = "raw", lastN = 600) {
  const t0 = Math.min(...s.filter((x) => x.t.length).map((x) => x.t[0]));
  return {
    dataZoom: [{ type: "inside" as const }],
    grid: { bottom: 30 },
    xAxis: { type: "value" as const, name: "Time (s)", scale: true },
    yAxis: { type: "value" as const, name: unit, scale: true },
    series: s.map((x) => ({ name: `S${x.id}`, type: "line" as const, showSymbol: false, lineStyle: { width: 1, color: css(`--sensor-${x.id}`) }, itemStyle: { color: css(`--sensor-${x.id}`) }, data: x.t.slice(-lastN).map((t, i, arr) => [(t - t0) / 1000, (which === "raw" ? x.raw : x.processed)[x.t.length - arr.length + i]]) })),
  };
}

function Overview() {
  const { sensors, source, usingPreview, state, samples } = useAnalysis("res");
  const unit = unitLabel(state.settings.displayUnit);
  const span = datasetSpan(samples);
  const streamStatus = useSensorStreams();
  const valid = state.serial.connected ? sensors.filter((s) => streamStatus(s.id) === "receiving").length : sensors.filter((s) => s.series.length).length;
  const top = sensors.filter((s) => s.peaks[0]).sort((a, b) => b.peaks[0].mag - a.peaks[0].mag)[0];
  const has = samples.length > 0;
  const fftOpt = useMemo(() => ({
    grid: { bottom: 30 }, dataZoom: [{ type: "inside" as const }],
    xAxis: { type: "value" as const, name: "Hz" }, yAxis: { type: "value" as const, name: unit },
    series: sensors.filter((s) => s.sp).map((s) => ({ name: `S${s.id}`, type: "line" as const, showSymbol: false, lineStyle: { width: 1, color: css(`--sensor-${s.id}`) }, itemStyle: { color: css(`--sensor-${s.id}`) }, data: s.sp!.freq.map((f, i) => [f, s.sp!.mag[i]]) })),
  }), [sensors, unit]);
  const barOpt = {
    grid: { bottom: 30 }, dataZoom: [], xAxis: { type: "category" as const, data: sensors.map((s) => `S${s.id}`) }, yAxis: { type: "value" as const, name: unit },
    series: [{ name: "RMS vibration", type: "bar" as const, data: sensors.map((s) => ({ value: isFinite(s.rmsVib) ? s.rmsVib : null, itemStyle: { color: css(`--sensor-${s.id}`) } })) }, { name: "Peak |a|", type: "bar" as const, itemStyle: { color: css("--analysis") }, data: sensors.map((s) => (isFinite(s.peak) ? s.peak : null)) }],
  };
  return (
    <Page title="Overview" subtitle={NO_MEDICAL} actions={<><SourceTag source={source} preview={usingPreview} /><ImportCsvButton /><DemoButton /></>}>
      {source === "demo" && <div className="rounded-lg border-2 border-demo bg-demo/10 px-3 py-2 text-sm font-semibold text-demo">DEMO DATA — synthetic signals for interface demonstration. These are not measurements.</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Key readings now" right={<SourceTag source={source} preview={usingPreview} />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border-2 border-analysis/50 bg-analysis/10 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resonance frequency (candidate)</div>
              <div className="mt-1 font-mono text-3xl font-bold">{top ? top.peaks[0].freq.toFixed(2) : "—"} <span className="text-base">Hz</span></div>
              <div className="text-[11px] text-muted-foreground">{top ? `strongest spectral peak · S${top.id}; confirm with a sweep` : "no valid spectrum yet"}</div>
            </div>
            <div className="rounded-lg border-2 border-sensor-1/50 bg-sensor-1/10 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RMS vibration (mean of sensors)</div>
              {(() => { const v = sensors.map((s) => s.rmsVib).filter(isFinite); return <div className="mt-1 font-mono text-3xl font-bold">{v.length ? fmt(v.reduce((a, b) => a + b, 0) / v.length) : "—"} <span className="text-base">{unit}</span></div>; })()}
              <div className="text-[11px] text-muted-foreground">processed signal, baseline removed</div>
            </div>
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current frequency per sensor</div>
              <div className="mt-1 space-y-0.5 font-mono text-sm">
                {sensors.map((s) => <div key={s.id} className="flex justify-between"><span style={{ color: `var(--sensor-${s.id})` }}>S{s.id}</span><span>{s.peaks[0] ? `${s.peaks[0].freq.toFixed(2)} Hz` : "—"}</span><span className="text-muted-foreground">{fmt(s.rmsVib)} {unit}</span></div>)}
              </div>
              <div className="text-[11px] text-muted-foreground">dominant peak in latest FFT window</div>
            </div>
          </div>
        </Panel>
        <Panel title="3D skull · vibration attenuation"><Skull3D height={260} /></Panel>
      </div>
      <MeasuredParametersStrip />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="ESP32 connection" value={state.serial.connected ? "Connected" : "Disconnected"} hint={state.serial.supported ? state.serial.portLabel || "Web Serial available" : "Web Serial unsupported"} />
        <Metric label="Sensors with valid data" value={`${valid} / 3`} hint={state.serial.connected ? "received within last 3 s" : "in active dataset"} />
        <Metric label="Measured sampling rate" value={fmt(sensors.find((s) => isFinite(s.fs))?.fs ?? NaN, 1)} unit="Hz" hint={`configured ${state.settings.nominalRateHz} Hz`} />
        <Metric label="Total samples" value={samples.length.toLocaleString()} hint={usingPreview ? "live preview buffer" : state.acquiring ? "acquiring" : ""} />
        <Metric label="Duration" value={span ? span.durS.toFixed(2) : "—"} unit="s" />
        <Metric label="Active experiment" value={<span className="text-sm">{state.experiment?.id ?? "—"}</span>} hint={state.experiment?.title} />
        <Metric label="Latest RMS (S1 vib.)" value={fmt(sensors[0].rmsVib)} unit={unit} />
        <Metric label="Top spectral peak" value={top ? top.peaks[0].freq.toFixed(2) : "—"} unit="Hz" hint={top ? `candidate · S${top.id}` : "no valid spectrum"} />
      </div>
      {!has ? (
        <Empty title="No hardware or dataset connected">Connect the ESP32 on the <Link to="/hardware" className="underline">Hardware</Link> page, import a CSV, open a saved experiment, or explicitly load demo data.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {sensors.map((s) => (
            <Panel key={s.id} title={`Sensor ${s.id} · resultant (raw)`} right={<QualityTag status={s.qualityStatus} />}>
              {s.series.length ? <EChart option={waveOption([s], unit)} height={180} /> : <Empty title="No data from this sensor" />}
            </Panel>
          ))}
          <Panel title="Resultant acceleration — all sensors (processed)"><EChart option={waveOption(sensors.filter((s) => s.t.length), unit, "processed")} height={200} /></Panel>
          <Panel title="Latest FFT spectrum">{fftOpt.series.length ? <EChart option={fftOpt} height={200} /> : <Empty title="Not enough samples" />}</Panel>
          <Panel title="Sensor response comparison"><EChart option={barOpt} height={200} /></Panel>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent experiments" right={<Link className="btn" to="/experiments">All</Link>}>
          {state.experiments.length ? (
            <table className="tbl"><tbody>{state.experiments.slice(0, 6).map((e) => (
              <tr key={e.id}><td>{e.id}</td><td className="font-sans">{e.title}</td><td><SourceTag source={e.source} /></td><td><button className="btn h-6" onClick={() => openExperiment(e.id)}>Open</button></td></tr>
            ))}</tbody></table>
          ) : <Empty title="No saved experiments" />}
        </Panel>
        <Panel title="Activity">
          <div className="mb-2 text-xs text-muted-foreground">Last successful USB connection: <span className="font-mono">{state.serial.lastConnected ? new Date(state.serial.lastConnected).toLocaleString() : "never"}</span></div>
          <div className="max-h-48 overflow-auto font-mono text-[11px]">
            {[...(state.experiment?.processingLog.slice(-5).reverse().map((p) => ({ at: p.at, level: "info", msg: `Processing: ${p.op}` })) ?? []), ...state.log.slice(0, 12)].map((l, i) => (
              <div key={i} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : ""}>{l.at.slice(11, 19)} {l.msg}</div>
            ))}
            {!state.log.length && <div className="text-muted-foreground">No activity yet.</div>}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
