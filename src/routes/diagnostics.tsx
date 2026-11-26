import { createFileRoute } from "@tanstack/react-router";
import { Page, Panel, QualityTag, fmt } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { head } from "@/lib/nsx/head";
import { download } from "@/lib/nsx/io";
import { ProtocolDiagnostics } from "@/components/nsx/ProtocolDiagnostics";

export const Route = createFileRoute("/diagnostics")({
  head: head("Diagnostics", "USB, parser, firmware and data-quality diagnostics with acquisition log export."),
  component: Diag,
});

function Diag() {
  const { sensors, state } = useAnalysis("res");
  const sr = state.serial;
  const checks = [
    ["USB connection", sr.connected ? "connected" : "disconnected", sr.connected ? "good" : "warning"],
    ["Web Serial support", sr.supported ? "available" : "unavailable", sr.supported ? "good" : "invalid"],
    ["Serial parser", `${sr.validSamples} valid / ${sr.parseErrors} errors / ${sr.textLines} text`, sr.parseErrors > sr.validSamples * 0.01 ? "warning" : "good"],
    ["Firmware", sr.firmware ?? "version not reported", sr.firmware ? "good" : "warning"],
    ["Experiment complete", state.experiment ? (state.experiment.acqEnd || state.source !== "live" ? "yes" : "acquisition not stopped") : "no experiment", state.experiment?.acqEnd || state.source !== "live" ? "good" : "warning"],
    ["Processing errors", `${state.log.filter((l) => l.level === "error").length} logged`, state.log.some((l) => l.level === "error") ? "warning" : "good"],
  ];
  const exportDiag = () => download(`NeuroSenseX_Diagnostics_${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`, JSON.stringify({ serial: sr, sensors: sensors.map((s) => ({ id: s.id, quality: s.q, issues: s.issues, status: s.qualityStatus })), log: state.log }, null, 2), "application/json");
  return (
    <Page title="Diagnostics & Data Quality" actions={<button className="btn" onClick={exportDiag}>Export diagnostics</button>}>
      <Panel title="System checks"><table className="tbl"><tbody>{checks.map(([a, b, c]) => <tr key={a}><td className="font-sans">{a}</td><td className="font-sans">{b}</td><td><QualityTag status={c} /></td></tr>)}</tbody></table></Panel>
      <Panel title="Per-sensor data quality">
        <table className="tbl"><thead><tr><th>Sensor</th><th>Samples</th><th>Measured Hz</th><th>Configured Hz</th><th>Jitter %</th><th>Missing (gaps)</th><th>Duplicate ts</th><th>Out-of-order</th><th>Invalid</th><th>Saturated</th><th>Status</th></tr></thead>
          <tbody>{sensors.map((s) => <tr key={s.id}><td>S{s.id}</td><td>{s.q.n}</td><td>{fmt(s.fs, 2)}</td><td>{state.settings.nominalRateHz}</td><td>{fmt(s.q.jitterPct, 1)}</td><td>{s.q.gaps}</td><td>{s.q.duplicates}</td><td>{s.q.nonMonotonic}</td><td>{s.q.invalid}</td><td>{s.q.saturated}</td><td><QualityTag status={s.qualityStatus} /></td></tr>)}</tbody></table>
        <p className="mt-2 text-[11px] text-muted-foreground">Gaps are inferred from intervals &gt;1.5× the median interval. Saturation flags |a| ≥ {state.settings.satLimitG} g (MPU6050 ±2 g range). Acquisition reliability is only as good as these indicators show.</p>
      </Panel>
      <Panel title="Acquisition log">
        <div className="max-h-96 overflow-auto font-mono text-[11px]">{state.log.map((l, i) => <div key={i} className={l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : ""}>{l.at} [{l.level}] {l.msg}</div>)}{!state.log.length && "Empty."}</div>
      </Panel>
      <ProtocolDiagnostics />
    </Page>
  );
}
