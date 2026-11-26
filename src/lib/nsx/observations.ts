import type { SensorAnalysis } from "./analysis";
import { msi } from "./dsp";
import type { Experiment, Settings } from "./types";

export interface Observation { category: string; text: string; evidence: string }

/** Deterministic rule-based research observations. No ML model; every statement is backed by computed metrics. */
export function observations(sensors: SensorAnalysis[], st: Settings, exp: Experiment | null, unit: string): { obs: Observation[]; blocked: string[] } {
  const blocked: string[] = [];
  const valid = sensors.filter((s) => s.qualityStatus === "good" || s.qualityStatus === "warning");
  if (valid.length === 0) return { obs: [], blocked: ["No sensor has valid data — analysis cannot be completed."] };
  sensors.filter((s) => s.qualityStatus === "no data" || s.qualityStatus === "invalid").forEach((s) => blocked.push(`Sensor ${s.id}: ${s.qualityStatus} — excluded.`));
  const obs: Observation[] = [];
  const byRms = [...valid].sort((a, b) => b.rmsVib - a.rmsVib);
  if (byRms.length >= 2) {
    const hi = byRms[0], lo = byRms.at(-1)!;
    obs.push({ category: "Pattern recognition", text: `Sensor ${hi.id} recorded a higher RMS vibration acceleration than Sensor ${lo.id} during the analysed interval.`, evidence: `RMS S${hi.id} = ${hi.rmsVib.toPrecision(4)} ${unit}; S${lo.id} = ${lo.rmsVib.toPrecision(4)} ${unit} (ratio ${(hi.rmsVib / lo.rmsVib).toFixed(2)}).` });
  }
  const peaks = valid.filter((s) => s.peaks[0]);
  if (peaks.length) {
    const fs = peaks.map((s) => s.peaks[0].freq);
    const spread = Math.max(...fs) - Math.min(...fs);
    const df = peaks[0].sp!.df;
    obs.push({
      category: "Resonance peak interpretation",
      text: spread <= 2 * df && peaks.length > 1 ? `The dominant candidate spectral peak coincides across ${peaks.length} sensors (within 2 bins).` : `Dominant candidate spectral peaks differ between sensors.`,
      evidence: peaks.map((s) => `S${s.id}: ${s.peaks[0].freq.toFixed(3)} Hz`).join("; ") + `. Bin width ${df.toFixed(4)} Hz. ${exp?.excitationHz != null || exp?.sweepSteps.length ? "Excitation documented." : "No controlled excitation documented — not a confirmed resonance."}`,
    });
  } else blocked.push("No spectral peaks above threshold — peak interpretation skipped.");
  const [a, b] = st.msiPair;
  const m = msi(sensors[a - 1].rmsVib, sensors[b - 1].rmsVib);
  if (isFinite(m)) obs.push({ category: "Mechanical symmetry comparison", text: `Project-defined MSI between S${a} and S${b} is ${m.toFixed(3)} (1 = equal response).`, evidence: `RMS S${a} = ${sensors[a - 1].rmsVib.toPrecision(4)}, S${b} = ${sensors[b - 1].rmsVib.toPrecision(4)} ${unit}. Valid only for mirror-image placement.` });
  if (!exp?.sweepSteps.length) blocked.push("Frequency response summary: no documented excitation steps.");
  if (exp?.decayStartMs == null) blocked.push("Damping summary: no documented free-decay interval.");
  valid.forEach((s) => s.issues.length && obs.push({ category: "Data quality", text: `Sensor ${s.id} has data-quality issues that may affect results.`, evidence: s.issues.join("; ") }));
  blocked.push("Feature classification: no validated model or labelled dataset exists; not performed.");
  return { obs, blocked };
}
