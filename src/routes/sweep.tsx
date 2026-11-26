import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Page, Panel, Empty } from "@/components/nsx/ui";
import { datasetSpan, useAnalysis } from "@/lib/nsx/analysis";
import { head } from "@/lib/nsx/head";
import { get, saveMeta, set } from "@/lib/nsx/store";
import type { SweepStep } from "@/lib/nsx/types";

export const Route = createFileRoute("/sweep")({
  head: head("Frequency Sweep", "Plan stepped-sine excitation, validate against the acquisition Nyquist limit and document excitation intervals."),
  component: Sweep,
});

function Sweep() {
  const { sensors, state, samples } = useAnalysis("res");
  const fs = sensors.find((s) => isFinite(s.fs))?.fs ?? state.settings.nominalRateHz;
  const nyq = fs / 2;
  const [cfg, setCfg] = useState({ start: 5, stop: 40, step: 5, dwell: 3, waveform: "stepped sine", amp: 10 });
  const span = datasetSpan(samples);
  const exp = state.experiment;
  const planned = [] as number[];
  for (let f = cfg.start; f <= cfg.stop + 1e-9 && planned.length < 200; f += cfg.step) planned.push(+f.toFixed(4));
  const invalid = planned.filter((f) => f >= nyq);
  const steps = exp?.sweepSteps ?? [];
  const persist = async (next: SweepStep[]) => {
    if (!exp) return;
    const e = { ...exp, sweepSteps: next, excitationWaveform: "stepped sine" };
    if (get().experiments.some((x) => x.id === exp.id)) await saveMeta(e); else set({ experiment: e });
  };
  const fromPlan = () => {
    if (!span) { toast.error("Load a dataset first"); return; }
    const valid = planned.filter((f) => f < nyq);
    const settle = 0.5;
    const next = valid.map((f, i) => ({ requestedHz: f, actualHz: null, tStartMs: Math.round(span.startMs + (i * cfg.dwell + settle) * 1000), tEndMs: Math.round(span.startMs + (i + 1) * cfg.dwell * 1000), verified: false }));
    if (next.at(-1) && next.at(-1)!.tEndMs > span.endMs) toast.warning("Plan extends beyond the recording; later steps will have too few samples.");
    persist(next);
  };
  const fromFirmware = () => {
    const ex = state.excitations.filter((x) => x.t != null);
    if (ex.length < 1) { toast.error("No EXC messages with timestamps were received from firmware."); return; }
    const next = ex.map((x, i) => ({ requestedHz: x.hz, actualHz: x.hz, tStartMs: x.t! + 500, tEndMs: (ex[i + 1]?.t ?? span?.endMs ?? x.t! + 3000) - 50, verified: true }));
    persist(next);
  };
  const edit = (i: number, p: Partial<SweepStep>) => persist(steps.map((s, k) => (k === i ? { ...s, ...p } : s)));
  return (
    <Page title="Frequency Sweep" subtitle="Excitation planning and documentation. Physical excitation depends on the signal source, PAM8403 amplifier and firmware — this page never assumes it occurred.">
      <div className="notice">
        <b>Hardware limits.</b> Current acquisition: measured {fs.toFixed(1)} Hz → Nyquist {nyq.toFixed(1)} Hz. The bone-conduction transducer (8 Ω, 1 W RMS, 300 Hz–19 kHz, specified resonance ≈1,600 Hz) operates entirely above this limit, so its response cannot be characterised with the current MPU6050 configuration. The PAM8403 is an amplifier, not a signal generator; a clean sweep needs a suitable source (e.g. DAC/I2S with reconstruction filter) and safe output-level control.
      </div>
      <Panel title="Sweep plan">
        <div className="flex flex-wrap gap-3">
          {(["start", "stop", "step", "dwell", "amp"] as const).map((k) => (
            <label key={k} className="lbl">{{ start: "Start (Hz)", stop: "Stop (Hz)", step: "Increment (Hz)", dwell: "Dwell per step (s)", amp: "Requested amplitude (% FS)" }[k]}<input className="field w-28" type="number" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: +e.target.value })} /></label>
          ))}
          <label className="lbl">Waveform<select className="field" value={cfg.waveform} onChange={(e) => setCfg({ ...cfg, waveform: e.target.value })}><option>sine</option><option>stepped sine</option><option>linear sweep</option><option>logarithmic sweep</option></select></label>
        </div>
        <div className="mt-3 text-xs">{planned.length} steps planned. {invalid.length > 0 && <span className="font-semibold text-destructive">{invalid.length} step(s) ≥ Nyquist ({invalid.slice(0, 6).join(", ")} Hz…) are disabled and will not be used.</span>}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled title="No firmware sweep command is implemented in the current ESP32 firmware">Start physical sweep (unsupported by current firmware)</button>
          <button className="btn btn-primary" disabled={!exp || !span} onClick={fromPlan}>Apply plan to recorded dataset (offline, unverified)</button>
          <button className="btn" disabled={!exp} onClick={fromFirmware}>Build steps from firmware EXC log ({state.excitations.length})</button>
          {steps.length > 0 && <button className="btn btn-danger" onClick={() => persist([])}>Clear steps</button>}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Offline mode associates planned frequencies with time intervals of an existing recording, assuming excitation followed the plan from the recording start with 0.5 s settling. Steps stay “unverified” until the operator confirms them. If firmware emits <code>EXC,&lt;hz&gt;,&lt;t_ms&gt;</code>, steps can be built from the actual generated frequencies.</p>
      </Panel>
      <Panel title="Excitation steps for active experiment" right={<Link to="/parameters/$param" params={{ param: "frequency-response" }} className="btn">View frequency response</Link>}>
        {!exp ? <Empty title="No active experiment" /> : !steps.length ? <Empty title="No excitation steps documented" /> : (
          <table className="tbl"><thead><tr><th>#</th><th>Requested Hz</th><th>Actual Hz</th><th>Start ms</th><th>End ms</th><th>Verified</th></tr></thead><tbody>
            {steps.map((s, i) => (
              <tr key={i}><td>{i + 1}</td><td>{s.requestedHz}</td>
                <td><input className="field h-6 w-20" type="number" value={s.actualHz ?? ""} placeholder="unknown" onChange={(e) => edit(i, { actualHz: e.target.value === "" ? null : +e.target.value })} /></td>
                <td><input className="field h-6 w-24" type="number" value={s.tStartMs} onChange={(e) => edit(i, { tStartMs: +e.target.value })} /></td>
                <td><input className="field h-6 w-24" type="number" value={s.tEndMs} onChange={(e) => edit(i, { tEndMs: +e.target.value })} /></td>
                <td><input type="checkbox" checked={s.verified} onChange={(e) => edit(i, { verified: e.target.checked })} /></td></tr>
            ))}
          </tbody></table>
        )}
      </Panel>
      <Panel title="Excitation command history">
        {state.excitations.length ? <div className="font-mono text-[11px]">{state.excitations.map((x, i) => <div key={i}>{x.at} EXC {x.hz} Hz t={x.t ?? "—"}</div>)}</div> : <Empty title="No excitation messages received" />}
      </Panel>
    </Page>
  );
}
