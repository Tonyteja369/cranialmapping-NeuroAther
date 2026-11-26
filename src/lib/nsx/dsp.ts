import type { Axis, Sample, SensorId, Settings, SweepStep } from "./types";
import { G } from "./types";

export const resultant = (ax: number, ay: number, az: number) => Math.sqrt(ax * ax + ay * ay + az * az);

export function axisValue(x: Sample, a: Axis) {
  return a === "res" ? resultant(x.ax, x.ay, x.az) : x[a];
}

export function toUnit(vG: number, unit: "g" | "ms2") {
  return unit === "ms2" ? vG * G : vG;
}
export const unitLabel = (u: "g" | "ms2") => (u === "ms2" ? "m/s²" : "g");

export function rms(x: number[]) {
  if (!x.length) return NaN;
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}
export function peakToPeak(x: number[]) {
  if (!x.length) return NaN;
  return Math.max(...x) - Math.min(...x);
}
export function peakAbs(x: number[]) {
  if (!x.length) return NaN;
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
}
export const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);

export function removeBaseline(x: number[], t: number[], method: Settings["baseline"]) {
  if (method === "none" || x.length < 2) return x.slice();
  if (method === "mean") {
    const m = mean(x);
    return x.map((v) => v - m);
  }
  // linear least squares detrend
  const n = x.length;
  const mt = mean(t), mx = mean(x);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (t[i] - mt) * (x[i] - mx);
    den += (t[i] - mt) ** 2;
  }
  const b = den ? num / den : 0;
  return x.map((v, i) => v - (mx + b * (t[i] - mt)));
}

/** Single-pole IIR filters (documented, causal) and moving average. */
export function applyFilter(x: number[], fs: number, f: Settings["filter"]) {
  if (f.type === "none" || !x.length) return x.slice();
  if (f.type === "movingavg") {
    const k = Math.max(1, Math.round(f.taps));
    const out: number[] = [];
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      s += x[i];
      if (i >= k) s -= x[i - k];
      out.push(s / Math.min(i + 1, k));
    }
    return out;
  }
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * f.cutoffHz);
  const out = new Array(x.length);
  if (f.type === "lowpass") {
    const a = dt / (rc + dt);
    out[0] = x[0];
    for (let i = 1; i < x.length; i++) out[i] = out[i - 1] + a * (x[i] - out[i - 1]);
  } else {
    const a = rc / (rc + dt);
    out[0] = 0;
    for (let i = 1; i < x.length; i++) out[i] = a * (out[i - 1] + x[i] - x[i - 1]);
  }
  return out;
}

export function windowCoeffs(n: number, fn: Settings["windowFn"]) {
  const w = new Array(n);
  for (let i = 0; i < n; i++) {
    if (fn === "hamming") w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    else if (fn === "hann") w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    else w[i] = 1;
  }
  return w;
}

/** In-place iterative radix-2 FFT. */
export function fft(re: number[], im: number[]) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

export interface Spectrum {
  freq: number[];
  mag: number[]; // single-sided amplitude spectrum, same unit as input (window-corrected)
  fs: number;
  n: number;
  df: number;
  nyquist: number;
  windowFn: string;
}

/** Single-sided amplitude spectrum: A_k = 2|X_k| / sum(w). Uses the LAST n samples. Mean removed first. */
export function spectrum(x: number[], fs: number, n: number, fn: Settings["windowFn"]): Spectrum | null {
  if (x.length < n || n < 8 || !isFinite(fs) || fs <= 0) return null;
  const seg = x.slice(x.length - n);
  const m = mean(seg);
  const w = windowCoeffs(n, fn);
  const sw = w.reduce((a, b) => a + b, 0);
  const re = seg.map((v, i) => (v - m) * w[i]);
  const im = new Array(n).fill(0);
  fft(re, im);
  const freq: number[] = [], mag: number[] = [];
  for (let k = 0; k <= n / 2; k++) {
    freq.push((k * fs) / n);
    const a = Math.hypot(re[k], im[k]) / sw;
    mag.push(k === 0 || k === n / 2 ? a : 2 * a);
  }
  return { freq, mag, fs, n, df: fs / n, nyquist: fs / 2, windowFn: fn };
}

export interface Peak { freq: number; mag: number; threshold: number }

/** Local maxima above threshold*max, excluding DC bin, within [fMin,fMax]. */
export function detectPeaks(sp: Spectrum, thrFrac: number, fMin: number, fMax: number, max = 8): Peak[] {
  const { freq, mag } = sp;
  let gmax = 0;
  for (let k = 1; k < mag.length; k++) if (freq[k] >= fMin && freq[k] <= fMax) gmax = Math.max(gmax, mag[k]);
  const thr = gmax * thrFrac;
  const out: Peak[] = [];
  for (let k = 1; k < mag.length - 1; k++) {
    if (freq[k] < fMin || freq[k] > fMax) continue;
    if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] >= thr && mag[k] > 0) out.push({ freq: freq[k], mag: mag[k], threshold: thr });
  }
  return out.sort((a, b) => b.mag - a.mag).slice(0, max);
}

export function largestPow2(n: number) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Measured sampling rate from median inter-sample interval (per sensor). */
export function measuredRate(t: number[]) {
  if (t.length < 3) return NaN;
  const d: number[] = [];
  for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  return med > 0 ? 1000 / med : NaN;
}

export function sensorSeries(samples: Sample[], s: SensorId) {
  return samples.filter((x) => x.sensorId === s);
}

export interface QualityReport {
  n: number;
  duplicates: number;
  nonMonotonic: number;
  invalid: number;
  gaps: number;
  saturated: number;
  measuredHz: number;
  jitterPct: number;
}
export function quality(series: Sample[], satG: number): QualityReport {
  let duplicates = 0, nonMonotonic = 0, invalid = 0, gaps = 0, saturated = 0;
  const t = series.map((x) => x.timestamp);
  const fs = measuredRate(t);
  const expected = 1000 / fs;
  const dts: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const x = series[i];
    if (![x.ax, x.ay, x.az, x.timestamp].every(isFinite)) invalid++;
    if (Math.abs(x.ax) >= satG || Math.abs(x.ay) >= satG || Math.abs(x.az) >= satG) saturated++;
    if (i > 0) {
      const dt = x.timestamp - series[i - 1].timestamp;
      if (dt === 0) duplicates++;
      else if (dt < 0) nonMonotonic++;
      else {
        dts.push(dt);
        if (isFinite(expected) && dt > 1.5 * expected) gaps += Math.round(dt / expected) - 1;
      }
    }
  }
  const m = mean(dts);
  const sd = Math.sqrt(mean(dts.map((d) => (d - m) ** 2)));
  return { n: series.length, duplicates, nonMonotonic, invalid, gaps, saturated, measuredHz: fs, jitterPct: m ? (sd / m) * 100 : NaN };
}

/** Processed signal pipeline: raw (g) -> baseline -> filter -> display unit. Returns new arrays; raw untouched. */
export function processSeries(series: Sample[], axis: Axis, st: Settings, fs: number, offsets?: { ax: number; ay: number; az: number }) {
  const t = series.map((x) => x.timestamp);
  const raw = series.map((x) => axisValue(x, axis));
  const calibrated = series.map((x) => {
    if (!offsets) return axisValue(x, axis);
    const c = { ...x, ax: x.ax - offsets.ax, ay: x.ay - offsets.ay, az: x.az - offsets.az };
    return axisValue(c, axis);
  });
  const base = removeBaseline(calibrated, t, st.baseline);
  const filt = isFinite(fs) ? applyFilter(base, fs, st.filter) : base;
  return { t, raw, processed: filt };
}

/** Stepped-sine frequency response: RMS of baseline-removed response in each documented steady-state interval. */
export function frequencyResponse(series: Sample[], axis: Axis, steps: SweepStep[], nyquist: number) {
  return steps.map((st) => {
    const seg = series.filter((x) => x.timestamp >= st.tStartMs && x.timestamp <= st.tEndMs).map((x) => axisValue(x, axis));
    const m = mean(seg);
    const r = rms(seg.map((v) => v - m));
    const f = st.actualHz ?? st.requestedHz;
    let status = "valid";
    if (!st.verified) status = "excitation unverified";
    if (f >= nyquist) status = "above Nyquist — not measurable";
    if (seg.length < 16) status = "too few samples";
    return { freq: f, requested: st.requestedHz, actual: st.actualHz, rms: status === "valid" || status === "excitation unverified" ? r : NaN, n: seg.length, status };
  });
}

/** Logarithmic decrement damping from successive positive peaks after decay start. */
export function dampingEstimate(t: number[], x: number[], startMs: number) {
  const idx = t.findIndex((v) => v >= startMs);
  if (idx < 0) return { ok: false as const, reason: "Decay start is outside the recording." };
  const tt = t.slice(idx), xx0 = x.slice(idx);
  const m = mean(xx0);
  const xx = xx0.map((v) => v - m);
  const peaks: { t: number; a: number }[] = [];
  for (let i = 1; i < xx.length - 1; i++) if (xx[i] > 0 && xx[i] > xx[i - 1] && xx[i] >= xx[i + 1]) peaks.push({ t: tt[i], a: xx[i] });
  if (peaks.length < 4) return { ok: false as const, reason: "Fewer than 4 successive peaks after decay start.", peaks };
  const ys = peaks.map((p) => Math.log(p.a)), xs = peaks.map((p) => p.t / 1000);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0, sst = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; sst += (ys[i] - my) ** 2; }
  const slope = num / den;
  const icpt = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < xs.length; i++) sse += (ys[i] - (icpt + slope * xs[i])) ** 2;
  const r2 = sst ? 1 - sse / sst : 0;
  if (slope >= 0) return { ok: false as const, reason: "Peak envelope is not decaying.", peaks };
  if (r2 < 0.8) return { ok: false as const, reason: `Envelope does not follow exponential decay (R² = ${r2.toFixed(2)} < 0.80).`, peaks };
  const periods: number[] = [];
  for (let i = 1; i < peaks.length; i++) periods.push((peaks[i].t - peaks[i - 1].t) / 1000);
  const Td = mean(periods);
  const delta = -slope * Td; // log decrement per cycle
  const zeta = delta / Math.sqrt(4 * Math.PI ** 2 + delta ** 2);
  return { ok: true as const, peaks, decayRate: -slope, r2, delta, zeta, fd: 1 / Td, envelope: (ts: number) => Math.exp(icpt + slope * ts) };
}

/** MSI (project-defined): MSI = 1 − |A−B| / (A+B). 1 = equal response, 0 = one side silent. */
export function msi(a: number, b: number) {
  if (!(a >= 0 && b >= 0) || a + b === 0) return NaN;
  return 1 - Math.abs(a - b) / (a + b);
}
/** Signal attenuation relative to reference, dB: SA = 20·log10(A_ref / A_i). */
export const attenuationDb = (ref: number, v: number) => (ref > 0 && v > 0 ? 20 * Math.log10(ref / v) : NaN);

/** Pearson correlation after linear interpolation onto a common time grid (non-simultaneous sampling). */
export function interpCorrelation(a: { t: number[]; v: number[] }, b: { t: number[]; v: number[] }) {
  if (a.t.length < 8 || b.t.length < 8) return NaN;
  const t0 = Math.max(a.t[0], b.t[0]), t1 = Math.min(a.t.at(-1)!, b.t.at(-1)!);
  if (t1 <= t0) return NaN;
  const interp = (s: { t: number[]; v: number[] }, tq: number) => {
    let lo = 0, hi = s.t.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.t[mid] <= tq) lo = mid; else hi = mid; }
    const f = (tq - s.t[lo]) / (s.t[hi] - s.t[lo] || 1);
    return s.v[lo] + f * (s.v[hi] - s.v[lo]);
  };
  const N = 512;
  const xa: number[] = [], xb: number[] = [];
  for (let i = 0; i < N; i++) { const tq = t0 + ((t1 - t0) * i) / (N - 1); xa.push(interp(a, tq)); xb.push(interp(b, tq)); }
  const ma = mean(xa), mb = mean(xb);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < N; i++) { n += (xa[i] - ma) * (xb[i] - mb); da += (xa[i] - ma) ** 2; db += (xb[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : NaN;
}
