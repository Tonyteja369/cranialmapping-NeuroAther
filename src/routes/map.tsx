import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HeadMap, POSITIONS } from "@/components/nsx/HeadMap";
import { Skull3D } from "@/components/nsx/Skull3D";
import { MapControls, useMapValues, type MapMetric } from "@/components/nsx/params";
import { fmt, Page, Panel, QualityTag, SourceTag } from "@/components/nsx/ui";
import { head } from "@/lib/nsx/head";
import { download, downloadDataUrl, fname } from "@/lib/nsx/io";
import { updateSettings } from "@/lib/nsx/store";
import type { SensorId } from "@/lib/nsx/types";

export const Route = createFileRoute("/map")({
  head: head("Mechanical Resonance Map", "Three-location mechanical response map built from directly measured sensor values."),
  component: MapPage,
});

export async function svgToPng(id: string): Promise<string | null> {
  const el = document.getElementById(id) as SVGSVGElement | null;
  if (!el) return null;
  const clone = el.cloneNode(true) as SVGSVGElement;
  const cs = getComputedStyle(document.documentElement);
  let xml = new XMLSerializer().serializeToString(clone);
  xml = xml.replace(/var\((--[\w-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || "#888");
  if (!xml.includes("xmlns=")) xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 900; c.height = 900;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 900, 900);
  ctx.drawImage(img, 0, 0, 900, 900);
  return c.toDataURL("image/png");
}

function MapPage() {
  const [metric, setMetric] = useState<MapMetric>("rms");
  const [freq, setFreq] = useState(12.5);
  const [band, setBand] = useState<[number, number]>([1, 20]);
  const [sel, setSel] = useState<SensorId>(1);
  const m = useMapValues(metric, freq, band);
  const st = m.state.settings;
  const s = m.sensors[sel - 1];
  const exportPng = async () => {
    downloadDataUrl(fname(m.state.experiment, "ResonanceMap", "png"), await svgToPng("nsx-map-main"));
  };
  return (
    <Page title="Mechanical Resonance Map" subtitle="Three directly measured locations. The map does not show internal anatomy, every point on the head, or any lesion." actions={<><SourceTag source={m.source} preview={m.usingPreview} /><MapControls {...{ metric, setMetric, freq, setFreq, band, setBand }} /><button className="btn" onClick={exportPng}>Export PNG</button><button className="btn" onClick={() => download(fname(m.state.experiment, "ResonanceMap", "json"), JSON.stringify({ experiment: m.state.experiment?.id ?? null, metric: m.name, unit: m.unitFor, values: m.vals, positions: st.sensorPositions }, null, 2), "application/json")}>Export values</button></>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel><HeadMap id="nsx-map-main" values={m.vals} positions={st.sensorPositions} unit={m.unitFor} metricName={m.name} onSelect={setSel} selected={sel} /></Panel>
        <div className="flex flex-col gap-4">
          <Panel title={`Sensor ${sel} details`}>
            <table className="tbl"><tbody>
              <tr><td className="font-sans">Label</td><td className="font-sans">{s.label}</td></tr>
              <tr><td className="font-sans">Position</td><td><select className="field h-7" value={st.sensorPositions[sel]} onChange={(e) => updateSettings({ sensorPositions: { ...st.sensorPositions, [sel]: e.target.value } })}>{Object.entries(POSITIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></td></tr>
              <tr><td className="font-sans">RMS vibration</td><td>{fmt(s.rmsVib)} {m.unit}</td></tr>
              <tr><td className="font-sans">Peak |a|</td><td>{fmt(s.peak)} {m.unit}</td></tr>
              <tr><td className="font-sans">Displayed metric</td><td>{fmt(m.vals[sel - 1].value)} {m.unitFor}</td></tr>
              <tr><td className="font-sans">Dominant candidate peak</td><td>{s.peaks[0] ? `${s.peaks[0].freq.toFixed(3)} Hz` : "—"}</td></tr>
              <tr><td className="font-sans">Samples</td><td>{s.q.n}</td></tr>
              <tr><td className="font-sans">Quality</td><td><QualityTag status={s.qualityStatus} /></td></tr>
            </tbody></table>
          </Panel>
          <div className="notice-info">Marker values are directly measured. Click a marker to inspect it and reassign its position.</div>
          <Panel title="3D skull · vibration attenuation"><Skull3D /></Panel>
        </div>
      </div>
    </Page>
  );
}
