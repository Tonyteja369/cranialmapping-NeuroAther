import { describe, expect, it } from "vitest";
import { amplitudeAt, buildGraph, dijkstra, fitAttenuation, snrDb, uniformSegment } from "./attenuation";

describe("attenuation", () => {
  it("recovers a 10 Hz 0.05 g sine amplitude with Hann ±1 bin", () => {
    const fs = 100, x = Array.from({ length: 512 }, (_, i) => 1 + 0.05 * Math.sin((2 * Math.PI * 10 * i) / fs));
    expect(amplitudeAt(x, fs, 10)).toBeGreaterThan(0.045);
    expect(amplitudeAt(x, fs, 10)).toBeLessThan(0.055);
  });
  it("does not bridge gaps: uses longest gap-free run", () => {
    const t = [0, 10, 20, 30, 500, 510, 520, 530, 540, 550];
    expect(uniformSegment(t, t.map(() => 1), 100).length).toBe(6);
  });
  it("6 dB SNR threshold = amplitude ratio ~2", () => { expect(snrDb(2, 1)).toBeCloseTo(6.02, 1); });
  it("fit needs n >= 3 and reports dB/cm", () => {
    expect(fitAttenuation([{ d: 1, amp: 1 }, { d: 2, amp: 0.5 }])).toBeNull();
    const f = fitAttenuation([0, 5, 10].map((d) => ({ d, amp: Math.pow(10, (-1 * d) / 20) })))!;
    expect(f.dbPerCm).toBeCloseTo(1, 5); expect(f.r2).toBeCloseTo(1, 5); expect(f.n).toBe(3);
  });
  it("dijkstra path length along a strip", () => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1, 0, 2, 1, 0]);
    const g = buildGraph(pos, [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4], 0.5);
    expect(dijkstra(g.offs, g.nbr, g.w, 0).dist[2]).toBeCloseTo(2, 5);
  });
});
