import { createFileRoute } from "@tanstack/react-router";
import { Page, Panel } from "@/components/nsx/ui";
import { useAnalysis } from "@/lib/nsx/analysis";
import { head } from "@/lib/nsx/head";
import SKETCH from "@/firmware/NeuroSenseX/NeuroSenseX.ino?raw";
import { download } from "@/lib/nsx/io";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/firmware")({
  head: head("Firmware & Protocol", "ESP32 firmware modules and the documented NeuroSense-X serial protocol."),
  component: Fw,
});

function Fw() {
  const { sensors, state } = useAnalysis("res");
  const sr = state.serial;
  const mods = [
    ["A. ESP32 firmware", "Initialises I2C, multiplexer, sensors and serial; reports FW version."],
    ["B. Sensor driver", "MPU6050 register access per TCA9548A channel; ±2 g range → 16384 LSB/g."],
    ["C. Multi-sensor acquisition", "Sequential channel switching; sensors are not sampled simultaneously."],
    ["D. Serial communication", "Line-oriented ASCII, one sample per line, newline-terminated."],
    ["E. Calibration", "Performed in software on this site; firmware sends uncorrected values."],
    ["F. Frequency sweep control", "Not implemented in current firmware. Future: EXC,<hz>,<t_ms> report lines."],
    ["G. Acquisition timing", "Replacement sketch sends 64-bit device microseconds at nominal 50 Hz per sensor, within the 115200-baud budget; achieved rate is measured from timestamps. Register reads are sequential, not synchronized."],
  ];
  return (
    <Page title="Firmware & Protocol" subtitle="The website does not change ESP32 settings; no configuration commands are implemented in the current firmware.">
      <Panel title="Reported parameters">
        <table className="tbl"><tbody>
          <tr><td className="font-sans">Firmware version</td><td>{sr.firmware ?? "not reported"}</td></tr>
          <tr><td className="font-sans">Sensor count / identifiers</td><td>3 · Sensor 1, Sensor 2, Sensor 3</td></tr>
          <tr><td className="font-sans">Sensor communication</td><td>{[1, 2, 3].map((i) => `S${i}: ${sr.sensorStatus[i as 1] === undefined ? "not reported" : sr.sensorStatus[i as 1] ? "OK" : "FAIL"}`).join(" · ")}</td></tr>
          <tr><td className="font-sans">Sampling rate (reported / measured)</td><td>{sr.reportedRate ?? "—"} Hz / {sensors.map((s) => (isFinite(s.fs) ? s.fs.toFixed(1) : "—")).join(", ")} Hz</td></tr>
          <tr><td className="font-sans">Baud rate (host)</td><td>{state.settings.baud}</td></tr>
          <tr><td className="font-sans">Parse error count</td><td>{sr.parseErrors}</td></tr>
        </tbody></table>
      </Panel>
      <Panel title="Embedded modules"><table className="tbl"><tbody>{mods.map(([a, b]) => <tr key={a}><td className="font-sans font-semibold">{a}</td><td className="font-sans">{b}</td></tr>)}</tbody></table></Panel>
      <Panel title="Serial protocol">
        <table className="tbl"><thead><tr><th>Line</th><th>Meaning</th></tr></thead><tbody>
          <tr><td>timestamp_us,sensor_id,ax_g,ay_g,az_g</td><td className="font-sans">Raw data sample; IDs 1–3; device microseconds; acceleration in g. Select Five-field protocol in Settings before connecting.</td></tr>
          <tr><td>timestamp_us,sample,sensor_id,ax,ay,az,gx,gy,gz,temperature_C</td><td className="font-sans">Extended CSV preset in Settings. Timestamp in microseconds; choose actual firmware ID base (0–2 or 1–3) and acceleration unit. Sample index, gyro and temperature are ignored, not acceleration data.</td></tr>
          <tr><td>STATUS,S1=OK,S2=OK,S3=FAIL</td><td className="font-sans">Sensor detection status</td></tr>
          <tr><td>FW,1.0.0</td><td className="font-sans">Firmware version</td></tr>
          <tr><td>RATE,100</td><td className="font-sans">Firmware-configured sampling rate (Hz)</td></tr>
          <tr><td>EXC,12.5,30500</td><td className="font-sans">Excitation actually generated at 12.5 Hz from t=30500 ms (future)</td></tr>
          <tr><td># any text</td><td className="font-sans">Diagnostic text, logged only</td></tr>
        </tbody></table>
        <p className="mt-2 text-[11px] text-muted-foreground">Arbitrary diagnostic output (e.g. "MPU6050 found on channel 2") cannot be interpreted as measurements. Update the firmware to print the format above.</p>
        <p className="mt-2 text-[11px] text-muted-foreground">Your supplied Mean / Dominant Frequency / FFT complete lines contain summaries only, not timestamped X/Y/Z records. Raw output elsewhere is unconfirmed. The replacement sketch below has not been flashed or hardware-verified. Confirm SDA 21, SCL 22, TCA address 0x70, MPU address 0x68 and channels 0/1/2 before flashing. Requires the ESP32 Arduino core; no additional libraries.</p>
        <Button variant="outline" size="sm" className="btn mt-2" onClick={() => download("NeuroSenseX.ino", SKETCH)}>Download streaming sketch</Button>
        <pre className="mt-3 overflow-auto rounded-md bg-secondary p-3 font-mono text-[11px]">{SKETCH}</pre>
      </Panel>
    </Page>
  );
}
