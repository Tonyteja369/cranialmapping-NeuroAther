import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EChart } from "@/components/nsx/EChart";
import { AxisSelect, Empty, fmt, Page, Panel, QualityTag, SourceTag } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { unitLabel } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";
import { updateSettings } from "@/lib/nsx/store";
import { useSensorStreams } from "@/lib/nsx/sensor-stream";
import { Button } from "@/components/ui/button";
import { resultant } from "@/lib/nsx/dsp";
import { G } from "@/lib/nsx/types";
import type { Axis } from "@/lib/nsx/types";

export const Route = createFileRoute("/live")({
  head: head("Live Monitoring", "Live scrolling raw acceleration waveforms for the three MPU6050 sensors."),
  component: Live,
});
const css = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : undefined);

function Live() {
  const [axis, setAxis] = useState<Axis>("res");
  const [frozen, setFrozen] = useState<null | ReturnType<typeof useAnalysis>["sensors"]>(null);
  const a = useAnalysis(axis, "stream");
  const streamStatus = useSensorStreams();
  const ax = useAnalysis("ax", "stream"), ay = useAnalysis("ay", "stream"), az = useAnalysis("az", "stream");
  const st = a.state.settings;
  const unit = unitLabel(st.displayUnit);
  const sensors = frozen ?? a.sensors;
  useEffect(() => setFrozen(null), [axis, st.displayUnit]);
  return (
    <Page title="Live Monitoring" subtitle="Raw measurements as received (gravity and baseline included). Processed values are labelled separately." actions={<>
      <SourceTag source={a.source} preview={a.usingPreview} />
      <AxisSelect value={axis} onChange={setAxis} />
      <label className="lbl">Window<select className="field" value={st.windowSec} onChange={(e) => updateSettings({ windowSec: +e.target.value })}>{[2, 5, 10, 30, 60].map((w) => <option key={w} value={w}>{w} s</option>)}</select></label>
      <label className="lbl">Unit<select className="field" value={st.displayUnit} onChange={(e) => updateSettings({ displayUnit: e.target.value as "g" | "ms2" })}><option value="g">g</option><option value="ms2">m/s²</option></select></label>
      <Button variant="outline" size="sm" className="btn" onClick={() => setFrozen(frozen ? null : a.sensors)}>{frozen ? "Resume display" : "Pause display"}</Button></>}>
      {sensors.map((s, i) => {
        const end = s.t.at(-1) ?? 0;
        const k = Math.max(0, s.t.findIndex((t) => t >= end - st.windowSec * 1000));
        const opt = {
          tooltip: { trigger: "axis" as const, axisPointer: { type: "cross" as const } },
          xAxis: { type: "value" as const, name: "Time (s)", nameLocation: "middle" as const, nameGap: 24, scale: true },
          yAxis: { type: "value" as const, name: `${axis === "res" ? "Resultant" : axis.toUpperCase()} (${unit})`, scale: true },
          series: [{ name: `S${s.id} raw ${axis}`, type: "line" as const, showSymbol: false, lineStyle: { width: 1.2, color: css(`--sensor-${s.id}`) }, itemStyle: { color: css(`--sensor-${s.id}`) }, data: s.t.slice(k).map((t, j) => [t / 1000, s.raw[k + j]]) }],
        };
        const last = s.series.at(-1);
        const conv = st.displayUnit === "ms2" ? G : 1;
        return (
          <Panel key={s.id} title={`Sensor ${s.id} · ${s.label}`} right={<><QualityTag status={s.qualityStatus} />{a.state.serial.connected && <span className="tag tag-muted">{streamStatus(s.id)}</span>}</>}>
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              {s.series.length ? <EChart option={opt} height={220} /> : <Empty title="No data from this sensor" />}
              <table className="tbl"><tbody>
                <tr><td className="font-sans">Current X / Y / Z</td><td>{last ? `${fmt(last.ax * conv, 3)} / ${fmt(last.ay * conv, 3)} / ${fmt(last.az * conv, 3)}` : "—"}</td></tr>
                <tr><td className="font-sans">Current resultant (raw)</td><td>{fmt(last ? resultant(last.ax, last.ay, last.az) * conv : NaN)}</td></tr>
                <tr><td className="font-sans">Samples in view</td><td>{s.series.length}</td></tr>
                <tr><td className="font-sans">RMS raw</td><td>{fmt(s.rmsRaw)}</td></tr>
                <tr><td className="font-sans">RMS processed</td><td>{fmt(s.rmsVib)}</td></tr>
                <tr><td className="font-sans">Peak-to-peak processed</td><td>{fmt(s.p2p)}</td></tr>
                <tr><td className="font-sans">X/Y/Z RMS raw</td><td>{fmt(ax.sensors[i].rmsRaw, 3)} / {fmt(ay.sensors[i].rmsRaw, 3)} / {fmt(az.sensors[i].rmsRaw, 3)}</td></tr>
                <tr><td className="font-sans">Issues</td><td className="font-sans text-[10px]">{s.issues.join("; ") || "none detected"}</td></tr>
              </tbody></table>
            </div>
          </Panel>
        );
      })}
    </Page>
  );
}
