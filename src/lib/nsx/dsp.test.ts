import { describe, it, expect } from "vitest";
import { rms, peakToPeak, resultant, spectrum, detectPeaks, msi, attenuationDb, measuredRate } from "./dsp";
import { parseLine } from "./parser";

describe("scientific calculations", () => {
  it("resultant", () => expect(resultant(3, 4, 12)).toBe(13));
  it("rms", () => expect(rms([1, -1, 1, -1])).toBe(1));
  it("peak-to-peak", () => expect(peakToPeak([-2, 0, 3])).toBe(5));
  it("100 Hz, 256 samples -> df 0.390625, Nyquist 50", () => {
    const x = Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * 12.5 * i) / 100));
    const sp = spectrum(x, 100, 256, "rect");
    if (!sp) throw new Error("Expected spectrum");
    expect(sp.df).toBe(0.390625);
    expect(sp.nyquist).toBe(50);
    const p = detectPeaks(sp, 0.5, 0.1, 50);
    expect(p[0].freq).toBe(12.5);
    expect(p[0].mag).toBeCloseTo(1, 3);
  });
  it("msi and attenuation", () => {
    expect(msi(1, 1)).toBe(1);
    expect(msi(3, 1)).toBe(0.5);
    expect(attenuationDb(10, 1)).toBe(20);
  });
  it("measured rate", () => expect(measuredRate([0, 10, 20, 30])).toBe(100));
});

describe("parser", () => {
  const cfg = { delimiter: ",", columns: "t,id,ax,ay,az" };
  it("parses valid line", () => expect(parseLine("10,2,0.018,-0.006,1.002", cfg)).toEqual({ kind: "sample", detectedSensorId: 2, sample: { timestamp: 10, sensorId: 2, ax: 0.018, ay: -0.006, az: 1.002 } }));
  it("rejects bad sensor id", () => expect(parseLine("10,4,0,0,1", cfg).kind).toBe("error"));
  it("rejects non-numeric", () => expect(parseLine("10,1,abc,0,1", cfg).kind).toBe("error"));
  it("status line", () => expect(parseLine("STATUS,S1=OK,S2=OK,S3=FAIL", cfg)).toEqual({ kind: "status", sensors: { 1: true, 2: true, 3: false } }));
});
