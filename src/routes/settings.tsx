import { createFileRoute } from "@tanstack/react-router";
import { POSITIONS } from "@/components/nsx/HeadMap";
import { Page, Panel } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { head } from "@/lib/nsx/head";
import { defaultSettings, updateSettings } from "@/lib/nsx/store";
import type { SensorId, Settings, SkullSite } from "@/lib/nsx/types";
import { Button } from "@/components/ui/button";
import { STREAM_PROTOCOL } from "@/lib/nsx/parser";

export const Route = createFileRoute("/settings")({
  head: head("Settings", "Serial protocol, sensor labels, processing defaults and units for Neuro Ather."),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, sensors } = useAnalysis("res");
  const st = state.settings;
  const meas = sensors.find((s) => isFinite(s.fs))?.fs;
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ [k]: +e.target.value } as Partial<Settings>);
  return (
    <Page title="Settings" subtitle="Stored in this browser." actions={<Button variant="outline" size="sm" className="btn btn-danger" disabled={state.serial.connected} onClick={() => updateSettings(defaultSettings)}>Reset to defaults</Button>}>
      <Panel title="Serial protocol">
        <fieldset disabled={state.serial.connected} className="flex flex-wrap gap-3 disabled:opacity-60">
          <label className="lbl">Baud<input className="field w-28" type="number" value={st.baud} onChange={num("baud")} /></label>
          <label className="lbl">Delimiter<select className="field" value={st.delimiter} onChange={(e) => updateSettings({ delimiter: e.target.value })}><option value=",">comma</option><option value=";">semicolon</option><option value="\t">tab</option><option value=" ">space</option></select></label>
          <label className="lbl">Column order (t,id,ax,ay,az; use _ to skip)<input className="field w-64 font-mono" value={st.columns} onChange={(e) => updateSettings({ columns: e.target.value })} /></label>
          <label className="lbl">Incoming unit<select className="field" value={st.inputUnit} onChange={(e) => updateSettings({ inputUnit: e.target.value as "g" | "ms2" })}><option value="g">g</option><option value="ms2">m/sÂ²</option></select></label>
          <label className="lbl">Device timestamp unit<select className="field" value={st.timestampUnit} onChange={(e) => updateSettings({ timestampUnit: e.target.value as Settings["timestampUnit"] })}><option value="ms">milliseconds</option><option value="us">microseconds</option><option value="s">seconds</option></select></label>
          <label className="lbl">Firmware sensor IDs<select className="field" value={st.sensorIdBase} onChange={(e) => updateSettings({ sensorIdBase: Number(e.target.value) as 0 | 1 })}><option value={1}>1â€“3 â†’ Sensor 1â€“3</option><option value={0}>0â€“2 â†’ Sensor 1â€“3</option></select></label>
          <Button variant="outline" size="sm" className="btn" onClick={() => updateSettings(STREAM_PROTOCOL)}>Five-field protocol</Button>
          <Button variant="outline" size="sm" className="btn" onClick={() => updateSettings({ columns: "timestamp_us,sample,sensor_id,ax,ay,az,gx,gy,gz,temperature_C", timestampUnit: "us" })}>Extended CSV protocol</Button>
        </fieldset>
        <p className="mt-2 text-[11px] text-muted-foreground">Device timestamps are preserved and normalized to milliseconds, not host receive time. A timestamp_us/ms/s column fixes its time unit explicitly. Stored acceleration is g. Select sensor IDs and incoming units to match the firmware; these are never guessed. Disconnect to change the protocol.</p>
      </Panel>
      <Panel title="Sensors">
        <div className="grid gap-3 md:grid-cols-3">
          {([1, 2, 3] as SensorId[]).map((id) => (
            <div key={id} className="flex flex-col gap-2 rounded-md border p-2">
              <label className="lbl">Sensor {id} location label<input className="field" value={st.sensorLabels[id]} onChange={(e) => updateSettings({ sensorLabels: { ...st.sensorLabels, [id]: e.target.value } })} /></label>
              <label className="lbl">Map position<select className="field" value={st.sensorPositions[id]} onChange={(e) => updateSettings({ sensorPositions: { ...st.sensorPositions, [id]: e.target.value } })}>{Object.entries(POSITIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
              <label className="lbl">3D skull site<select className="field" value={(st.skullSites ?? {})[id]} onChange={(e) => updateSettings({ skullSites: { ...st.skullSites, [id]: e.target.value as SkullSite } })}><option value="left-temporal">Subject-left temporal</option><option value="right-temporal">Subject-right temporal</option><option value="frontal">Frontal midline</option><option value="ref">REF (next to TX)</option></select></label>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="lbl">Reference sensor (attenuation)<select className="field" value={st.referenceSensor} onChange={(e) => updateSettings({ referenceSensor: +e.target.value as SensorId })}>{[1, 2, 3].map((i) => <option key={i} value={i}>Sensor {i}</option>)}</select></label>
          <label className="lbl">Saturation limit (g)<input className="field w-24" type="number" step="0.01" value={st.satLimitG} onChange={num("satLimitG")} /></label>
        </div>
      </Panel>
      <Panel title="Timing & display">
        <div className="flex flex-wrap gap-3">
          <label className="lbl">Configured sampling rate metadata (Hz)<input className="field w-28" type="number" value={st.nominalRateHz} onChange={num("nominalRateHz")} /></label>
          <label className="lbl">Chart window (s)<input className="field w-24" type="number" value={st.windowSec} onChange={num("windowSec")} /></label>
          <label className="lbl">Display unit<select className="field" value={st.displayUnit} onChange={(e) => updateSettings({ displayUnit: e.target.value as "g" | "ms2" })}><option value="g">g</option><option value="ms2">m/sÂ²</option></select></label>
        </div>
        <div className={meas && Math.abs(meas - st.nominalRateHz) / st.nominalRateHz > 0.05 ? "notice mt-3" : "notice-info mt-3"}>Configured {st.nominalRateHz} Hz vs measured {meas ? meas.toFixed(2) : "â€”"} Hz. All calculations use the measured rate from timestamps; the configured value is metadata only.</div>
        <p className="mt-2 text-[11px] text-muted-foreground">Filter, FFT size, window, peak threshold and frequency range are configured in Signal Processing. Data are stored locally in IndexedDB; clearing site data removes them.</p>
      </Panel>
    </Page>
  );
}
