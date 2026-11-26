import { createFileRoute } from "@tanstack/react-router";
import { MeasuredParametersStrip } from "@/components/nsx/params";
import { fmt, Page, Panel, QualityTag, SourceTag, SYNC_WARNING } from "@/components/nsx/ui";
import { datasetSpan, useAnalysis } from "@/lib/nsx/analysis";
import { attenuationDb, dampingEstimate, msi, unitLabel } from "@/lib/nsx/dsp";
import { head } from "@/lib/nsx/head";

export const Route = createFileRoute("/resonance")({
  head: head("Resonance Analysis", "Resonance frequency, peak vibration acceleration, signal attenuation and mechanical symmetry with documented methods."),
  component: Resonance,
});

function Resonance() {
  const { sensors, source, usingPreview, state, samples } = useAnalysis("res");
  const st = state.settings;
  const unit = unitLabel(st.displayUnit);
  const span = datasetSpan(samples);
  const interval = span ? `0–${span.durS.toFixed(2)} s` : "—";
  const ref = sensors[st.referenceSensor - 1];
  const exp = state.experiment;
  const excited = !!exp && (exp.excitationHz != null || exp.sweepSteps.length > 0);
  const [a, b] = st.msiPair;
  const rows = sensors.flatMap((s) => {
    const d = exp?.decayStartMs != null && s.t.length ? dampingEstimate(s.t, s.processed, exp.decayStartMs) : null;
    return [
      { p: "RF — candidate resonance", v: s.peaks[0] ? s.peaks[0].freq.toFixed(3) : "—", u: "Hz", s, band: `${st.fMin}–${Math.min(st.fMax, s.fs / 2 || st.fMax).toFixed(1)} Hz`, m: "Largest local maximum of amplitude spectrum", note: excited ? "Excitation documented; confirm across sweep" : "No controlled excitation — spectral peak only" },
      { p: "PVA — peak vibration accel.", v: fmt(s.peak), u: unit, s, band: "broadband", m: "max |a_res − baseline| after filter", note: "" },
      { p: "RMS acceleration", v: fmt(s.rmsVib), u: unit, s, band: "broadband", m: "√(Σx²/N), processed", note: "" },
      { p: "Peak-to-peak", v: fmt(s.p2p), u: unit, s, band: "broadband", m: "max − min, processed", note: "" },
      { p: "SA — attenuation vs ref", v: s.id === ref.id ? "reference" : fmt(attenuationDb(ref.rmsVib, s.rmsVib), 2), u: "dB", s, band: "broadband", m: `20·log₁₀(RMS_S${ref.id}/RMS_i)`, note: "Mounting & coupling affect amplitude" },
      { p: "Spectral peak count", v: s.sp ? String(s.peaks.length) : "—", u: "", s, band: `≥${Math.round(st.peakThreshold * 100)}% max`, m: "Local maxima above threshold", note: "" },
      { p: "Damping ratio ζ", v: d?.ok ? d.zeta.toFixed(5) : "insufficient data", u: "", s, band: "decay", m: "Log decrement of free decay", note: d && !d.ok ? d.reason : d ? "" : "Decay start not documented" },
    ];
  });
  const msiV = msi(st.msiMetric === "rms" ? sensors[a - 1].rmsVib : sensors[a - 1].peak, st.msiMetric === "rms" ? sensors[b - 1].rmsVib : sensors[b - 1].peak);
  return (
    <Page title="Resonance Analysis" subtitle={`Analysis interval ${interval}. All metrics on resultant, processed signal (baseline “${st.baseline}”, filter “${st.filter.type}”).`} actions={<SourceTag source={source} preview={usingPreview} />}>
      <MeasuredParametersStrip />
      <div className="notice">The transducer's specified ≈1,600 Hz resonance is not the resonance of the test object. {SYNC_WARNING}</div>
      <Panel title="Project parameters">
        <table className="tbl"><thead><tr><th>Parameter</th><th>Sensor</th><th>Value</th><th>Unit</th><th>Band</th><th>Interval</th><th>Method</th><th>Quality</th><th>Notes</th></tr></thead><tbody>
          {rows.map((r, i) => <tr key={i}><td className="font-sans">{r.p}</td><td>S{r.s.id}</td><td>{r.v}</td><td>{r.u}</td><td>{r.band}</td><td>{interval}</td><td className="font-sans text-[10px]">{r.m}</td><td><QualityTag status={r.s.qualityStatus} /></td><td className="font-sans text-[10px]">{r.note}</td></tr>)}
          <tr><td className="font-sans">MSI (project-defined)</td><td>S{a}/S{b}</td><td>{fmt(msiV, 3)}</td><td>—</td><td>broadband</td><td>{interval}</td><td className="font-sans text-[10px]">1 − |A−B|/(A+B), {st.msiMetric}</td><td>—</td><td className="font-sans text-[10px]">Research metric; requires mirror-image placement</td></tr>
        </tbody></table>
      </Panel>
    </Page>
  );
}
