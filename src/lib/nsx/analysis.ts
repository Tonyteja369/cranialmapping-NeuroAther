import { useMemo } from "react";
import { useNsx } from "./store";
import type { Axis, Sample, SensorId, Settings } from "./types";
import { SENSOR_IDS } from "./types";
import { axisValue, detectPeaks, largestPow2, mean, measuredRate, peakAbs, peakToPeak, processSeries, quality, rms, spectrum, toUnit, type Peak, type QualityReport, type Spectrum } from "./dsp";

export interface SensorAnalysis {
  id: SensorId;
  label: string;
  series: Sample[];
  fs: number;
  q: QualityReport;
  t: number[]; // ms
  raw: number[]; // display unit
  processed: number[]; // display unit
  rmsRaw: number;
  rmsVib: number; // processed (baseline removed + filter)
  peak: number; // max |processed|
  p2p: number; // processed
  sp: Spectrum | null;
  peaks: Peak[];
  qualityStatus: "no data" | "good" | "warning" | "invalid";
  issues: string[];
}

export function analyseDataset(samples: Sample[], st: Settings, axis: Axis, labels: Record<SensorId, string>, offsets?: Partial<Record<SensorId, { ax: number; ay: number; az: number }>>): SensorAnalysis[] {
  return SENSOR_IDS.map((id) => {
    const series = samples.filter((x) => x.sensorId === id);
    const fs = measuredRate(series.map((x) => x.timestamp));
    const q = quality(series, st.satLimitG);
    const pr = processSeries(series, axis, st, fs, offsets?.[id]);
    const u = st.displayUnit;
    const raw = pr.raw.map((v) => toUnit(v, u));
    const processed = pr.processed.map((v) => toUnit(v, u));
    const n = Math.min(st.fftSize, largestPow2(processed.length));
    const sp = n >= 16 ? spectrum(processed, fs, n, st.windowFn) : null;
    const peaks = sp ? detectPeaks(sp, st.peakThreshold, st.fMin, Math.min(st.fMax, sp.nyquist)) : [];
    const issues: string[] = [];
    if (!series.length) issues.push("No samples");
    if (q.invalid) issues.push(`${q.invalid} invalid values`);
    if (q.duplicates) issues.push(`${q.duplicates} duplicate timestamps`);
    if (q.nonMonotonic) issues.push(`${q.nonMonotonic} non-monotonic timestamps`);
    if (q.gaps) issues.push(`≈${q.gaps} missing samples (gaps)`);
    if (q.saturated) issues.push(`${q.saturated} samples near saturation`);
    if (isFinite(q.jitterPct) && q.jitterPct > 20) issues.push(`Sampling jitter ${q.jitterPct.toFixed(0)}%`);
    if (series.length && series.length < 64) issues.push("Fewer than 64 samples");
    if (isFinite(fs) && Math.abs(fs - st.nominalRateHz) / st.nominalRateHz > 0.1) issues.push(`Measured rate ${fs.toFixed(1)} Hz differs from configured ${st.nominalRateHz} Hz`);
    const qualityStatus = !series.length ? "no data" : q.invalid > 0 || series.length < 16 ? "invalid" : issues.length ? "warning" : "good";
    return {
      id, label: labels[id], series, fs, q, t: pr.t, raw, processed,
      rmsRaw: rms(raw), rmsVib: rms(processed), peak: peakAbs(processed), p2p: peakToPeak(processed),
      sp, peaks, qualityStatus, issues,
    };
  });
}

/** Select one dataset; a selected recording with samples wins outside explicit live monitoring.
 *  An empty, non-recording experiment never hides the live stream. */
export function selectActiveData(s: ReturnType<typeof useNsx>, mode: "active" | "stream" = "active") {
  const emptyExperiment = !!s.experiment && !s.acquiring && !s.samples.length;
  const usingPreview = s.serial.connected && (mode === "stream" || !s.experiment || emptyExperiment);
  const samples = usingPreview ? s.preview : s.samples;
  const source = usingPreview ? "live" : s.source;
  return { samples, source, usingPreview, state: s };
}

export function useActiveData(mode: "active" | "stream" = "active") {
  return selectActiveData(useNsx(), mode);
}

export function useAnalysis(axis: Axis = "res", mode: "active" | "stream" = "active") {
  const { samples, source, usingPreview, state } = useActiveData(mode);
  const labels = (usingPreview ? undefined : state.experiment?.sensorLabels) ?? state.settings.sensorLabels;
  const cal = usingPreview ? undefined : state.experiment?.calibration;
  const offsets = cal?.applied ? cal.offsets : undefined;
  const sensors = useMemo(
    () => analyseDataset(samples, state.settings, axis, labels, offsets),
    [state.settings, axis, samples, labels, offsets],
  );
  return { sensors, source, usingPreview, state, samples };
}

export function datasetSpan(samples: Sample[]) {
  if (!samples.length) return null;
  let a = Infinity, b = -Infinity;
  for (const x of samples) { if (x.timestamp < a) a = x.timestamp; if (x.timestamp > b) b = x.timestamp; }
  return { startMs: a, endMs: b, durS: (b - a) / 1000 };
}

export { axisValue, mean };
