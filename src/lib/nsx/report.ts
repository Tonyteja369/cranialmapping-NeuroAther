import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { SensorAnalysis } from "./analysis";
import { attenuationDb, dampingEstimate, frequencyResponse, msi } from "./dsp";
import { observations } from "./observations";
import type { DataSource, Experiment, Settings } from "./types";

/** Standard PDF fonts only cover WinAnsi; map scientific glyphs to safe text so nothing renders as garbage. */
export function pdfSafe(t: string) {
  return String(t)
    .replace(/Î¶/g, "zeta").replace(/Î´/g, "delta").replace(/Î”/g, "d").replace(/Î£/g, "sum").replace(/âˆš/g, "sqrt")
    .replace(/â‰ˆ/g, "~").replace(/[âˆ’â€“]/g, "-").replace(/â‰¥/g, ">=").replace(/â‰¤/g, "<=").replace(/Â²/g, "^2").replace(/Ï€/g, "pi")
    .replace(/[â†’]/g, "->").replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FFâ€”â€¢Â·Ã—]/g, "?");
}

const mm = (a: number[]) => { let lo = Infinity, hi = -Infinity; for (const v of a) if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };

/** Builds a paginated PDF report from available data only; sections without data are omitted or explicitly marked. */
export function buildReport(exp: Experiment, sensors: SensorAnalysis[], st: Settings, source: DataSource | null, unit: string, mapPng: string | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 18, TOP = 26, BOTTOM = H - 20, CW = W - 2 * M;
  const NAVY: [number, number, number] = [24, 38, 72], TEAL: [number, number, number] = [18, 128, 140];
  let y = TOP, sec = 0;
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };
  const h1 = (t: string, keep = 24) => {
    if (y > TOP) y += 4;
    ensure(keep); sec++;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...NAVY);
    doc.text(pdfSafe(`${sec}. ${t}`), M, y + 1); y += 3;
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.4); doc.line(M, y, M + CW, y); y += 6;
  };
  const p = (t: string, size = 9.5, style: "normal" | "italic" | "bold" = "normal") => {
    doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(40, 44, 56);
    const lh = size * 0.45;
    for (const line of doc.splitTextToSize(pdfSafe(t), CW) as string[]) { ensure(lh); doc.text(line, M, y + lh * 0.75); y += lh; }
    y += 2.5;
  };
  const na = (t: string) => p(`Not available â€” ${t}`, 9, "italic");
  const table = (head: string[], body: (string | number)[][], opts: { widths?: number[] } = {}) => {
    ensure(16);
    autoTable(doc, {
      startY: y, head: [head.map(pdfSafe)], body: body.map((r) => r.map((c) => pdfSafe(String(c)))),
      margin: { left: M, right: M, top: TOP, bottom: H - BOTTOM },
      theme: "grid", showHead: "everyPage", rowPageBreak: "avoid", tableWidth: CW,
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, overflow: "linebreak", valign: "middle", textColor: [40, 44, 56], lineColor: [210, 214, 222], lineWidth: 0.15 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: opts.widths ? Object.fromEntries(opts.widths.map((w, i) => [i, { cellWidth: w }])) : undefined,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  };
  const kv = (rows: [string, string][]) => table(["Field", "Value"], rows, { widths: [52, CW - 52] });
  const colors: [number, number, number][] = [[20, 140, 190], [16, 150, 110], [200, 90, 40]];
  const plot = (title: string, series: { xs: number[]; ys: number[]; name: string }[], xl: string, yl: string) => {
    const valid = series.map((s, i) => ({ ...s, color: colors[i % 3] })).filter((s) => s.xs.length > 1);
    if (!valid.length) return na(`${title}: no data`);
    const h = 58; ensure(h + 22);
    const x0 = M + 14, w = CW - 16, yTop = y + 5;
    const [xmin, xmax] = mm(valid.flatMap((s) => [mm(s.xs)[0], mm(s.xs)[1]]));
    const [ymin, ymax] = mm(valid.flatMap((s) => [mm(s.ys)[0], mm(s.ys)[1]]));
    const X = (v: number) => x0 + ((v - xmin) / (xmax - xmin || 1)) * w, Y = (v: number) => yTop + h - ((v - ymin) / (ymax - ymin || 1)) * h;
    doc.setDrawColor(225); doc.setLineWidth(0.1);
    for (let g = 1; g < 4; g++) doc.line(x0, yTop + (h * g) / 4, x0 + w, yTop + (h * g) / 4);
    doc.setDrawColor(150); doc.setLineWidth(0.2); doc.rect(x0, yTop, w, h);
    valid.forEach((s) => {
      doc.setDrawColor(...s.color); doc.setLineWidth(0.25);
      const step = Math.max(1, Math.floor(s.xs.length / 900));
      for (let i = step; i < s.xs.length; i += step) if (isFinite(s.ys[i]) && isFinite(s.ys[i - step])) doc.line(X(s.xs[i - step]), Y(s.ys[i - step]), X(s.xs[i]), Y(s.ys[i]));
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(ymax.toPrecision(3), x0 - 1, yTop + 2, { align: "right" }); doc.text(ymin.toPrecision(3), x0 - 1, yTop + h, { align: "right" });
    doc.text(xmin.toPrecision(4), x0, yTop + h + 4); doc.text(`${xmax.toPrecision(4)} ${xl}`, x0 + w, yTop + h + 4, { align: "right" });
    doc.text(pdfSafe(yl), x0, yTop - 1.5);
    let lx = x0 + w;
    [...valid].reverse().forEach((s) => { const tw = doc.getTextWidth(s.name); lx -= tw; doc.text(s.name, lx, yTop - 1.5); doc.setFillColor(...s.color); doc.rect(lx - 4, yTop - 3.2, 3, 1.6, "F"); lx -= 8; });
    y = yTop + h + 8;
    p(`Figure: ${title}. Experiment ${exp.id}.`, 8, "italic");
  };
  const f = (v: number, d = 4) => (isFinite(v) ? v.toFixed(d) : "â€”");
  const fs = sensors.find((s) => isFinite(s.fs))?.fs ?? NaN;
  const withData = sensors.filter((s) => s.q.n > 0);
  const srcLabel = source === "demo" ? "DEMO DATA (synthetic â€” not a measurement)" : source === "imported" ? "Imported experiment data" : "Live hardware data";

  // Cover
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 92, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.text("Neuro Ather", M, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.text("Cranial Resonance Lab â€” Experiment Research Report", M, 52);
  doc.setFontSize(9.5); doc.text(doc.splitTextToSize("Mechanical vibration measurement at three MPU6050 surface locations", CW), M, 62);
  y = 108;
  kv([["Experiment ID", exp.id], ["Title", exp.title], ["Data source", srcLabel], ["Created", new Date(exp.createdAt).toLocaleString()],
    ["Acquisition", `${exp.acqStart ? new Date(exp.acqStart).toLocaleString() : "â€”"} to ${exp.acqEnd ? new Date(exp.acqEnd).toLocaleString() : "â€”"}`],
    ["Report generated", new Date().toLocaleString()], ["Samples", String(sensors.reduce((a, s) => a + s.q.n, 0))], ["Quality status", exp.quality]]);
  p("Research-prototype disclaimer: Neuro Ather is an educational and research prototype. It is not a medical device, has no clinical validation and provides no diagnosis. Results describe mechanical vibration measured at three surface locations under the stated configuration.", 8.5, "italic");
  if (source === "demo") p("THIS REPORT IS GENERATED FROM SYNTHETIC DEMONSTRATION DATA. IT CONTAINS NO MEASUREMENTS.", 10, "bold");
  newPage();

  h1("Experiment Summary");
  p(`${sensors.reduce((a, s) => a + s.q.n, 0)} samples across ${withData.length} of 3 sensors at a measured ${f(fs, 2)} Hz (configured ${exp.nominalRateHz} Hz).`);
  exp.objective ? p(`Objective: ${exp.objective}`) : na("objective not recorded");
  if (exp.notes) p(`Notes: ${exp.notes}`);

  h1("Experimental Configuration");
  const ap = exp.acquisitionProtocol;
  kv([["Hardware", "ESP32-WROOM-32, TCA9548A I2C multiplexer, 3 Ã— MPU6050 (Â±2 g), USB serial"], ["Excitation", exp.excitationHz != null ? `${exp.excitationHz} Hz ${exp.excitationWaveform}` : `none documented (${exp.excitationWaveform})`],
    ["Wire protocol", ap ? `${ap.columns} (delim "${ap.delimiter}", ${ap.inputUnit}, ts ${ap.timestampUnit}, IDs from ${ap.sensorIdBase})` : `${st.columns} (delim "${st.delimiter}", ${st.inputUnit})`],
    ["Firmware", ap?.firmware ?? "not reported"], ["Display unit", unit], ["Processing", `baseline ${st.baseline}; filter ${st.filter.type}${st.filter.type === "movingavg" ? ` (${st.filter.taps} taps)` : st.filter.type !== "none" ? ` (cutoff ${st.filter.cutoffHz} Hz)` : ""}; FFT ${st.fftSize} pts, ${st.windowFn} window`],
    ["Calibration", exp.calibration ? `${exp.calibration.method} (${exp.calibration.applied ? "applied" : "not applied"}) at ${exp.calibration.timestamp}` : "none â€” values are uncalibrated raw readings"]]);
  table(["Sensor", "Location label", "Map position"], sensors.map((s) => [`S${s.id}`, exp.sensorLabels[s.id] ?? s.label, st.sensorPositions[s.id] ?? "â€”"]), { widths: [20, 90, CW - 110] });

  h1("Data Acquisition & Quality");
  p("Sensors are read sequentially through the multiplexer; samples from different sensors are not simultaneous. Rates are measured from device timestamps.");
  table(["Sensor", "Samples", "Measured Hz", "Jitter %", "Gaps", "Duplicates", "Out-of-order", "Invalid", "Saturated", "Status"],
    sensors.map((s) => [`S${s.id}`, s.q.n, f(s.fs, 2), f(s.q.jitterPct, 1), s.q.gaps, s.q.duplicates, s.q.nonMonotonic, s.q.invalid, s.q.saturated, s.qualityStatus]));
  if (exp.acquisitionEvents?.length) table(["Time", "Event"], exp.acquisitionEvents.map((e) => [new Date(e.at).toLocaleString(), e.action]), { widths: [70, CW - 70] });

  if (withData.length) {
    const t0 = Math.min(...withData.map((s) => s.t[0]));
    h1("Raw and Processed Signals", 100);
    p(`Raw = resultant acceleration from unmodified samples (${unit}). Processed = derived copy after baseline removal and filtering; raw data are never altered.`, 8.5, "italic");
    plot("Raw resultant acceleration", sensors.map((s) => ({ xs: s.t.map((t) => (t - t0) / 1000), ys: s.raw, name: `S${s.id}` })), "s", unit);
    plot("Processed resultant acceleration", sensors.map((s) => ({ xs: s.t.map((t) => (t - t0) / 1000), ys: s.processed, name: `S${s.id}` })), "s", unit);
    h1("Sensor-wise Measurements");
    table(["Sensor", `RMS raw (${unit})`, `RMS vibration (${unit})`, `Peak-to-peak (${unit})`, `Peak |a| (${unit})`], sensors.map((s) => [`S${s.id}`, f(s.rmsRaw), f(s.rmsVib), f(s.p2p), f(s.peak)]));

    h1("Frequency Analysis", 100);
    p(`Single-sided amplitude spectrum over the last ${st.fftSize} (or largest available power-of-2) processed samples, mean removed, ${st.windowFn} window. Frequency resolution = fs/N; Nyquist ${f(fs / 2, 2)} Hz.`);
    plot("Amplitude spectrum", sensors.map((s) => ({ xs: s.sp?.freq ?? [], ys: s.sp?.mag ?? [], name: `S${s.id}` })), "Hz", unit);
    const pk = sensors.flatMap((s) => s.peaks.map((x) => [`S${s.id}`, x.freq.toFixed(3), x.mag.toPrecision(4), x.threshold.toPrecision(3), "candidate peak"]));
    pk.length ? table(["Sensor", "Frequency (Hz)", `Amplitude (${unit})`, "Threshold", "Status"], pk) : na("no spectral peaks above the configured threshold");

    h1("Resonance Analysis");
    p(exp.excitationHz != null || exp.sweepSteps.length ? "Excitation was documented. Spectral peaks remain candidate resonances until confirmed by a verified sweep response." : "No controlled excitation was documented. Spectral peaks are not confirmed mechanical resonances; the transducer's specified resonance is not that of the test object.");
    if (exp.sweepSteps.length) table(["Step Hz", "Verified", "S1 RMS", "S2 RMS", "S3 RMS", "Status"], exp.sweepSteps.map((stp) => { const r = sensors.map((s) => frequencyResponse(s.series, "res", [stp], s.fs / 2)[0]); return [String(stp.actualHz ?? stp.requestedHz), stp.verified ? "yes" : "no", ...r.map((x) => f(x.rms)), r[0].status]; }));
    else na("no documented excitation steps; a validated frequency response cannot be calculated");

    const ref = sensors[st.referenceSensor - 1];
    h1("Attenuation & Mechanical Symmetry");
    table(["Sensor", `Attenuation vs S${ref.id} (dB)`], sensors.map((s) => [`S${s.id}`, s.id === ref.id ? "reference" : f(attenuationDb(ref.rmsVib, s.rmsVib), 2)]));
    const [a, b] = st.msiPair;
    p(`Project-defined MSI = 1 - |A-B|/(A+B) on RMS vibration, S${a} vs S${b}: ${f(msi(sensors[a - 1].rmsVib, sensors[b - 1].rmsVib), 3)}. Not a clinical metric; meaningful only for mirror-image sensor placement.`);

    h1("Damping Behaviour");
    if (exp.decayStartMs != null) table(["Sensor", "zeta", "log decrement", "R^2", "Result"], sensors.map((s) => { const d = s.t.length ? dampingEstimate(s.t, s.processed, exp.decayStartMs!) : null; return d?.ok ? [`S${s.id}`, d.zeta.toFixed(5), d.delta.toFixed(4), d.r2.toFixed(3), "estimated"] : [`S${s.id}`, "â€”", "â€”", "â€”", `insufficient: ${d?.reason ?? "no samples"}`]; }));
    else na("no documented free-decay interval");
  } else { h1("Measurements"); na("this experiment contains no valid sensor samples"); }

  h1("Mechanical Resonance Map", mapPng ? 120 : 24);
  if (mapPng) {
    const ip = doc.getImageProperties(mapPng); const iw = 90, ih = Math.min(120, (iw * ip.height) / ip.width);
    ensure(ih + 10); doc.addImage(mapPng, "PNG", M + (CW - iw) / 2, y, iw, ih, undefined, "FAST"); y += ih + 4;
    p("Figure: three-location RMS vibration map. Only measured values are shown; no interpolation between sensors.", 8, "italic");
  } else na("map image could not be captured");

  h1("AI-Assisted Research Observations");
  p("Generated by deterministic rules from the metrics above. These are interpretations, not measurements, and are not diagnostic.", 8.5, "italic");
  const ob = observations(sensors, st, exp, unit);
  ob.obs.length ? table(["Category", "Observation", "Evidence"], ob.obs.map((o) => [o.category, o.text, o.evidence]), { widths: [28, 82, CW - 110] }) : na("no observations met their evidence rules");
  if (ob.blocked.length) table(["Analyses not completed"], ob.blocked.map((x) => [x]));

  h1("Interpretation & Limitations");
  p(`Measurable frequency is limited by the Nyquist frequency (${f(fs / 2, 1)} Hz); the transducer band (300 Hzâ€“19 kHz) is above it. Sampling is multiplexed and non-simultaneous. Software baseline correction is not metrological calibration. Three surface sensors cannot represent whole-skull behaviour or internal anatomy.${source === "demo" ? " DATA ARE SYNTHETIC DEMO DATA." : ""}`);
  h1("Conclusion");
  p(withData.length ? `Measured RMS vibration: ${sensors.map((s) => `S${s.id} ${f(s.rmsVib)} ${unit}`).join(", ")}. ${sensors.some((s) => s.peaks.length) ? "Candidate spectral peaks are listed above." : "No candidate spectral peaks exceeded threshold."} No medical conclusions are drawn.` : "No conclusion can be drawn without valid samples.");
  h1("References & Technical Notes");
  p("Resultant a = sqrt(ax^2 + ay^2 + az^2); RMS = sqrt(sum x^2 / N); P-P = max - min; df = fs/N; Nyquist = fs/2; attenuation = 20 log10(A_ref/A); damping from logarithmic decrement, zeta = delta / sqrt(4 pi^2 + delta^2).");
  if (exp.processingLog.length) table(["Time", "Operation", "Settings"], exp.processingLog.map((l) => [l.at, l.op, JSON.stringify(l.settings)]), { widths: [40, 35, CW - 75] });

  // Headers and footers
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
    if (i > 1) {
      doc.text("Neuro Ather Â· Cranial Resonance Lab", M, 13);
      doc.text(doc.splitTextToSize(pdfSafe(`${exp.id} Â· ${exp.title}`), 90)[0], W - M, 13, { align: "right" });
      doc.setDrawColor(200); doc.setLineWidth(0.2); doc.line(M, 16, W - M, 16);
    }
    doc.setDrawColor(200); doc.line(M, H - 14, W - M, H - 14);
    doc.text(source === "demo" ? "Synthetic demo data â€” not a measurement" : "Research prototype â€” not a medical device", M, H - 9);
    doc.text(`Page ${i} of ${n}`, W - M, H - 9, { align: "right" });
  }
  return doc;
}
