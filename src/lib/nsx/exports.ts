import type { SensorAnalysis } from "./analysis";
import { datasetSpan } from "./analysis";
import type { Sheet } from "./io";
import type { Experiment, Sample, Settings } from "./types";

const meta = (e: Experiment) => ({ id: e.id, title: e.title, source: e.source, createdAt: e.createdAt, acqStart: e.acqStart, acqEnd: e.acqEnd, objective: e.objective, nominalRateHz: e.nominalRateHz, excitationHz: e.excitationHz, excitationWaveform: e.excitationWaveform, quality: e.quality, notes: e.notes, sensorLabels: e.sensorLabels });

/** Machine-readable experiment export keeping raw, calibration, processed and derived layers separate. */
export function experimentJson(e: Experiment, samples: Sample[], sensors?: SensorAnalysis[], st?: Settings) {
  return JSON.stringify({
    format: "NeuroSenseX/experiment@1", exportedAt: new Date().toISOString(),
    experiment: meta(e), acquisitionProtocol: e.acquisitionProtocol ?? null, acquisitionEvents: e.acquisitionEvents ?? [],
    calibration: e.calibration, sweepSteps: e.sweepSteps, decayStartMs: e.decayStartMs, processingLog: e.processingLog,
    span: datasetSpan(samples), settings: st ?? null,
    raw: { units: { timestamp: "ms (device)", acceleration: "g" }, columns: ["timestamp_ms", "sensor_id", "ax_g", "ay_g", "az_g"], samples: samples.map((s) => [s.timestamp, s.sensorId, s.ax, s.ay, s.az]) },
    derived: sensors?.map((s) => ({ sensorId: s.id, label: s.label, measuredRateHz: s.fs, quality: s.q, status: s.qualityStatus, rmsRaw: s.rmsRaw, rmsVibration: s.rmsVib, peakToPeak: s.p2p, peak: s.peak, candidatePeaks: s.peaks })) ?? null,
  });
}

export function experimentSheets(e: Experiment, samples: Sample[], sensors?: SensorAnalysis[], unit = "g"): Sheet[] {
  const m = meta(e);
  const sh: Sheet[] = [
    { name: "Experiment", header: ["Field", "Value"], rows: Object.entries(m).map(([k, v]) => [k, typeof v === "object" && v ? JSON.stringify(v) : (v as string | number | null)]) },
    { name: "Raw data (g)", header: ["timestamp_ms", "sensor_id", "ax_g", "ay_g", "az_g"], rows: samples.map((s) => [s.timestamp, s.sensorId, s.ax, s.ay, s.az]) },
  ];
  if (e.calibration) sh.push({ name: "Calibration", header: ["sensor_id", "offset_ax_g", "offset_ay_g", "offset_az_g", "method", "applied"], rows: Object.entries(e.calibration.offsets).map(([id, o]) => [+id, o.ax, o.ay, o.az, e.calibration!.method, e.calibration!.applied ? "yes" : "no"]) });
  if (sensors) {
    sh.push({ name: "Processed", header: ["timestamp_ms", "sensor_id", `resultant_raw_${unit}`, `resultant_processed_${unit}`], rows: sensors.flatMap((s) => s.t.map((t, i) => [t, s.id, s.raw[i], s.processed[i]])) });
    sh.push({ name: "Metrics (derived)", header: ["sensor_id", "samples", "measured_Hz", "jitter_pct", "gaps", "duplicates", "invalid", "saturated", "status", `rms_raw_${unit}`, `rms_vib_${unit}`, `p2p_${unit}`, `peak_${unit}`], rows: sensors.map((s) => [s.id, s.q.n, s.fs, s.q.jitterPct, s.q.gaps, s.q.duplicates, s.q.invalid, s.q.saturated, s.qualityStatus, s.rmsRaw, s.rmsVib, s.p2p, s.peak]) });
    sh.push({ name: "FFT", header: ["sensor_id", "frequency_Hz", `amplitude_${unit}`], rows: sensors.flatMap((s) => (s.sp ? s.sp.freq.map((f, i) => [s.id, f, s.sp!.mag[i]]) : [])) });
    sh.push({ name: "Candidate peaks", header: ["sensor_id", "frequency_Hz", `amplitude_${unit}`, "threshold", "status"], rows: sensors.flatMap((s) => s.peaks.map((p) => [s.id, p.freq, p.mag, p.threshold, "candidate"])) });
  }
  return sh;
}
