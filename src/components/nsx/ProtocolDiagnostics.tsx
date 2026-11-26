import { Panel } from "./ui";
import { useNsx } from "@/lib/nsx/store";

export function ProtocolDiagnostics() {
  const { serial } = useNsx();
  return <Panel title="Protocol diagnostics · last 50 lines">
    <div className="max-h-96 overflow-auto"><table className="tbl"><thead><tr><th>Raw received line</th><th>Message type</th><th>Parser result / rejection reason</th><th>Firmware ID</th><th>Normalized sample (ms; g)</th></tr></thead>
      <tbody>{serial.protocolDiagnostics.slice().reverse().map(({ raw, result }, index) => <tr key={index}>
        <td className="max-w-80 break-all">{raw}</td><td>{result.kind === "error" ? "malformed record" : result.kind === "text" ? "diagnostic text / header" : result.kind}</td>
        <td className="font-sans">{result.kind === "error" ? result.error : result.kind === "sample" ? "accepted" : "no sample"}</td>
        <td>{"detectedSensorId" in result ? result.detectedSensorId : "—"}</td>
        <td className="max-w-72 break-all">{result.kind === "sample" ? JSON.stringify(result.sample) : result.kind === "status" ? JSON.stringify(result.sensors) : "—"}</td>
      </tr>)}</tbody></table></div>
    {!serial.protocolDiagnostics.length && <p className="text-xs text-muted-foreground">No received lines.</p>}
  </Panel>;
}