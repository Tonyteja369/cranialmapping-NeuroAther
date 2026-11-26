import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page, Panel, Metric, NO_MEDICAL } from "@/components/nsx/ui";
import { head } from "@/lib/nsx/head";
import { useNsx, updateSettings, saveExperiment } from "@/lib/nsx/store";
import { connect, disconnect, pauseAcquisition, startAcquisition, stopAcquisition } from "@/lib/nsx/serial";
import { SENSOR_IDS } from "@/lib/nsx/types";
import { G } from "@/lib/nsx/types";
import { fmt } from "@/components/nsx/ui";
import { Button } from "@/components/ui/button";
import { ProtocolDiagnostics } from "@/components/nsx/ProtocolDiagnostics";
import { useSensorStreams } from "@/lib/nsx/sensor-stream";

export const Route = createFileRoute("/hardware")({
  head: head("Hardware Connection", "Connect the ESP32 over USB with Web Serial and acquire three-sensor MPU6050 data."),
  component: Hardware,
});

function Hardware() {
  const s = useNsx();
  const sr = s.serial;
  const streamStatus = useSensorStreams();
  const scale = s.settings.displayUnit === "ms2" ? G : 1;
  const run = (f: () => unknown) => async () => { try { await f(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <Page title="Hardware Connection" subtitle={NO_MEDICAL}>
      {!sr.supported && <div className="notice">Web Serial is not available in this browser. Use desktop Chrome, Edge or Opera (v89+) over HTTPS or localhost. Firefox and Safari do not support Web Serial. Open the app in its own tab (not an embedded preview frame) if the port picker does not appear.</div>}
      {sr.error && <div className="notice border-destructive/40">{sr.error}</div>}
      <Panel title="ESP32 USB serial" right={<>
        <label className="lbl">Baud rate<select className="field" value={s.settings.baud} disabled={sr.connected} onChange={(e) => updateSettings({ baud: +e.target.value })}>{[9600, 57600, 115200, 230400, 460800, 921600].map((b) => <option key={b}>{b}</option>)}</select></label>
        {!sr.connected ? <Button size="sm" disabled={!sr.supported} onClick={run(connect)}>Select port & connect ESP32</Button> : <Button variant="outline" size="sm" className="btn btn-danger" onClick={run(disconnect)}>Disconnect (release port)</Button>}
      </>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Status" value={sr.connected ? "Connected" : "Disconnected"} hint={sr.portLabel} />
          <Metric label="Lines received" value={sr.lines} />
          <Metric label="Valid samples" value={sr.validSamples} />
          <Metric label="Parse errors" value={sr.parseErrors} />
          <Metric label="Diagnostic text" value={sr.textLines} />
          <Metric label="Firmware" value={<span className="text-sm">{sr.firmware ?? "not reported"}</span>} hint={sr.reportedRate ? `reports ${sr.reportedRate} Hz` : undefined} />
        </div>
        {sr.connected && sr.lines > 20 && sr.validSamples === 0 && <div className="notice mt-3">No valid samples for the configured format ({s.settings.columns}). Check raw lines and rejection reasons below, then match the column order, ID base and units in Settings.</div>}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Sensor status">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Sensor</th><th>Firmware status</th><th>Data stream</th><th>Samples</th><th>X / Y / Z ({s.settings.displayUnit === "ms2" ? "m/s²" : "g"})</th></tr></thead><tbody>
            {SENSOR_IDS.map((id) => { const sample = sr.latestSample[id]; return (
              <tr key={id}><td>Sensor {id}</td><td className="font-sans">{sr.sensorStatus[id] === undefined ? "not reported" : sr.sensorStatus[id] ? "detected" : "NOT detected"}</td><td className="font-sans">{streamStatus(id)}</td><td>{sr.sampleCounts[id] ?? 0}</td><td>{sample ? `${fmt(sample.ax * scale, 3)} / ${fmt(sample.ay * scale, 3)} / ${fmt(sample.az * scale, 3)}` : "—"}</td></tr>
            ); })}
          </tbody></table></div>
          <p className="mt-2 text-[11px] text-muted-foreground">A USB connection alone does not mean a sensor is connected; status comes only from STATUS messages or valid samples.</p>
        </Panel>
        <Panel title="Acquisition">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!sr.connected || s.acquiring} onClick={run(startAcquisition)}>Start acquisition</Button>
            <Button variant="outline" size="sm" className="btn" disabled={!s.acquiring} onClick={() => pauseAcquisition(!s.paused)}>{s.paused ? "Resume" : "Pause"}</Button>
            <Button variant="outline" size="sm" className="btn" disabled={!s.acquiring} onClick={stopAcquisition}>Stop</Button>
            <Button variant="outline" size="sm" className="btn" disabled={s.acquiring || !s.experiment || !s.samples.length} onClick={run(async () => { await saveExperiment(); toast.success("Experiment saved"); })}>Save experiment</Button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">{s.acquiring ? `Recording ${s.experiment?.id}: ${s.samples.length} samples` : `Dataset: ${s.samples.length} samples`}</div>
        </Panel>
      </div>
      <ProtocolDiagnostics />
      <Panel title="Serial console (last 400 lines)">
        <pre className="h-64 overflow-auto rounded-md bg-secondary p-2 font-mono text-[11px]">{s.console.slice(-200).join("\n") || "No data received."}</pre>
      </Panel>
    </Page>
  );
}
