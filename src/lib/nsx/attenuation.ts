import { fft, largestPow2, measuredRate, resultant } from "./dsp";
import type { Sample, SensorId } from "./types";

/** Pure vibration-attenuation math for the 3D skull. No React, no three.js. */

export const SNR_MIN_DB = 6;
export const ALIAS_FRACTION = 0.4;

/** Longest gap-free run resampled to a uniform grid (linear interp inside the run only; gaps are never bridged). */
export function uniformSegment(t: number[], x: number[], fs: number): number[] {
  if (t.length < 2 || !(fs > 0)) return [];
  const dt = 1000 / fs;
  let best: [number, number] = [0, 0], start = 0;
  for (let i = 1; i <= t.length; i++) {
    if (i === t.length || t[i] - t[i - 1] > 1.5 * dt || !isFinite(x[i])) {
      if (i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = i;
    }
  }
  const [a, b] = best;
  if (b - a < 1) return [];
  const out: number[] = [];
  let j = a;
  for (let tt = t[a]; tt <= t[b]; tt += dt) {
    while (j < b - 1 && t[j + 1] < tt) j++;
    const f = (tt - t[j]) / (t[j + 1] - t[j] || 1);
    out.push(x[j] + (x[j + 1] - x[j]) * Math.min(1, Math.max(0, f)));
  }
  return out;
}

/** Sinusoid amplitude (same unit as x) at f: mean removed, Hann window, power summed over peak bin ±1. */
export function amplitudeAt(x: number[], fs: number, f: number): number {
  const n = largestPow2(x.length);
  if (n < 16) return NaN;
  const seg = x.slice(-n);
  const m = seg.reduce((s, v) => s + v, 0) / n;
  let sw2 = 0;
  const re = seg.map((v, i) => { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); sw2 += w * w; return (v - m) * w; });
  const im = new Array(n).fill(0);
  fft(re, im);
  const k = Math.round((f * n) / fs);
  if (k < 1 || k >= n / 2) return NaN;
  let p = 0;
  for (let i = Math.max(1, k - 1); i <= Math.min(n / 2 - 1, k + 1); i++) p += re[i] * re[i] + im[i] * im[i];
  return Math.sqrt((4 * p) / (n * sw2));
}

/** Amplitude (g) of the 3-axis resultant for one sensor, optionally inside [t0,t1] ms. */
export function sensorAmplitude(samples: Sample[], id: SensorId, f: number, win?: [number, number]) {
  const s = samples.filter((x) => x.sensorId === id && (!win || (x.timestamp >= win[0] && x.timestamp <= win[1]))).sort((a, b) => a.timestamp - b.timestamp);
  const t = s.map((x) => x.timestamp);
  const fs = measuredRate(t);
  const r = s.map((x) => resultant(x.ax, x.ay, x.az));
  return { amp: isFinite(fs) ? amplitudeAt(uniformSegment(t, r, fs), fs, f) : NaN, fs, n: s.length };
}

export const snrDb = (amp: number, noise: number) => (amp > 0 && noise > 0 ? 20 * Math.log10(amp / noise) : NaN);
export const relDb = (amp: number, ref: number) => (amp > 0 && ref > 0 ? 20 * Math.log10(amp / ref) : NaN);

export interface Fit { a: number; b: number; dbPerCm: number; r2: number; n: number }
/** Least-squares ln(A) = a + b·d (d in cm). Null when n < 3. dbPerCm is attenuation (positive = decays). */
export function fitAttenuation(pts: { d: number; amp: number }[]): Fit | null {
  const p = pts.filter((q) => isFinite(q.d) && q.amp > 0);
  const n = p.length;
  if (n < 3) return null;
  const xs = p.map((q) => q.d), ys = p.map((q) => Math.log(q.amp));
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  return { a, b, dbPerCm: (-b * 20) / Math.LN10, r2: syy ? (sxy * sxy) / (sxx * syy) : 1, n };
}

/** Dijkstra over a weighted adjacency list (CSR). Returns distances and predecessor array. */
export function dijkstra(offs: Uint32Array, nbr: Uint32Array, w: Float32Array, src: number) {
  const N = offs.length - 1;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap: number[] = [], hd: number[] = [];
  const push = (v: number, d: number) => {
    heap.push(v); hd.push(d);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hd[p], hd[i]] = [hd[i], hd[p]]; i = p; }
  };
  const pop = () => {
    const v = heap[0], d = hd[0], lv = heap.pop()!, ld = hd.pop()!;
    if (heap.length) {
      heap[0] = lv; hd[0] = ld;
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hd[l] < hd[m]) m = l; if (r < heap.length && hd[r] < hd[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hd[m], hd[i]] = [hd[i], hd[m]]; i = m; }
    }
    return [v, d] as const;
  };
  dist[src] = 0; push(src, 0);
  while (heap.length) {
    const [u, d] = pop();
    if (d > dist[u]) continue;
    for (let k = offs[u]; k < offs[u + 1]; k++) { const v = nbr[k], nd = d + w[k]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push(v, nd); } }
  }
  return { dist, prev };
}

/** Vertex-clustering decimation → CSR graph of cluster centroids connected by mesh edges. */
export function buildGraph(pos: Float32Array, index: ArrayLike<number> | null, cell: number) {
  const nv = pos.length / 3, key = new Map<string, number>(), cl = new Uint32Array(nv), cen: number[] = [], cnt: number[] = [];
  for (let i = 0; i < nv; i++) {
    const k = `${Math.floor(pos[i * 3] / cell)},${Math.floor(pos[i * 3 + 1] / cell)},${Math.floor(pos[i * 3 + 2] / cell)}`;
    let c = key.get(k);
    if (c === undefined) { c = cnt.length; key.set(k, c); cnt.push(0); cen.push(0, 0, 0); }
    cl[i] = c; cnt[c]++; cen[c * 3] += pos[i * 3]; cen[c * 3 + 1] += pos[i * 3 + 1]; cen[c * 3 + 2] += pos[i * 3 + 2];
  }
  const N = cnt.length;
  for (let c = 0; c < N; c++) for (let j = 0; j < 3; j++) cen[c * 3 + j] /= cnt[c];
  const adj: Set<number>[] = Array.from({ length: N }, () => new Set());
  const tri = index ? index.length : nv;
  for (let t = 0; t + 2 < tri; t += 3) {
    const v = [0, 1, 2].map((o) => cl[index ? index[t + o] : t + o]);
    for (let a = 0; a < 3; a++) { const p = v[a], q = v[(a + 1) % 3]; if (p !== q) { adj[p].add(q); adj[q].add(p); } }
  }
  const offs = new Uint32Array(N + 1);
  for (let c = 0; c < N; c++) offs[c + 1] = offs[c] + adj[c].size;
  const nbr = new Uint32Array(offs[N]), w = new Float32Array(offs[N]);
  for (let c = 0, k = 0; c < N; c++) for (const d of adj[c]) { nbr[k] = d; w[k++] = Math.hypot(cen[c * 3] - cen[d * 3], cen[c * 3 + 1] - cen[d * 3 + 1], cen[c * 3 + 2] - cen[d * 3 + 2]); }
  return { offs, nbr, w, cen: Float32Array.from(cen), cl };
}

export function nearestNode(cen: Float32Array, p: [number, number, number]) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cen.length / 3; i++) { const d = (cen[i * 3] - p[0]) ** 2 + (cen[i * 3 + 1] - p[1]) ** 2 + (cen[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/** Perceptual viridis ramp, t in [0,1] → rgb 0..1. */
const VIR = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
export const VIRIDIS_CSS = `linear-gradient(90deg,${VIR.map((c) => `rgb(${c.join(",")})`).join(",")})`;
export function viridis(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (VIR.length - 1), i = Math.min(VIR.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((j) => (VIR[i][j] + (VIR[i + 1][j] - VIR[i][j]) * f) / 255) as [number, number, number];
}
