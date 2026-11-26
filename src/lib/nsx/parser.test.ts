import { describe, expect, it } from "vitest";
import { LineBuffer, parseLine, STREAM_PROTOCOL } from "./parser";
import { parseCsv, rawCsv } from "./io";
import { G } from "./types";

const cfg = { delimiter: ",", columns: "timestamp,id,ax,ay,az" };
describe("canonical protocol validation", () => {
  it("uses the required microsecond/g/one-based streaming protocol", () => {
    expect(STREAM_PROTOCOL).toEqual({ delimiter: ",", columns: "timestamp_us,sensor_id,ax_g,ay_g,az_g", timestampUnit: "us", sensorIdBase: 1, inputUnit: "g" });
    for (const id of [1, 2, 3]) {
      expect(parseLine(`1234567,${id},0.25,-0.5,1`, STREAM_PROTOCOL)).toEqual({ kind: "sample", detectedSensorId: id, sample: { timestamp: 1234.567, sensorId: id, ax: 0.25, ay: -0.5, az: 1 } });
    }
  });
  it.each(["Collecting 256 samples...", "Sensor 1 | Mean = 0.99933 g | Dominant Frequency = 20.680 Hz", "Sensor 2 | Mean = 1.00312 g | Dominant Frequency = 16.569 Hz", "Sensor 3 | Mean = 0.99767 g | Dominant Frequency = 0.222 Hz", "------------------------------------", "FFT complete."])('never treats firmware summaries as samples: %s', (line) => {
    expect(parseLine(line, STREAM_PROTOCOL).kind).toBe("text");
  });
  it("honors explicitly labelled g even if the legacy incoming unit is m/s²", () => {
    const result = parseLine("10000,1,1,0,-1", { ...STREAM_PROTOCOL, inputUnit: "ms2" });
    expect(result.kind === "sample" && result.sample).toEqual({ timestamp: 10, sensorId: 1, ax: 1, ay: 0, az: -1 });
  });
  it("rejects empty sensor status", () => {
    expect(parseLine("STATUS", STREAM_PROTOCOL).kind).toBe("error");
    expect(parseLine("STATUS,", STREAM_PROTOCOL).kind).toBe("error");
  });
  it.each([1, 2, 3])("accepts one-based sensor %i", (id) => {
    expect(parseLine(`123.5,${id},0.1,-0.2,1`, cfg)).toEqual({ kind: "sample", detectedSensorId: id, sample: { timestamp: 123.5, sensorId: id, ax: 0.1, ay: -0.2, az: 1 } });
  });
  it.each([0, 1, 2])("normalizes zero-based sensor %i only when configured", (id) => {
    const result = parseLine(`100,${id},0,0,1`, { ...cfg, sensorIdBase: 0 });
    expect(result.kind === "sample" && result.sample.sensorId).toBe(id + 1);
  });
  it("does not guess ambiguous IDs", () => {
    const one = parseLine("10,1,0,0,1", cfg), zero = parseLine("10,1,0,0,1", { ...cfg, sensorIdBase: 0 });
    expect(one.kind === "sample" && one.sample.sensorId).toBe(1);
    expect(zero.kind === "sample" && zero.sample.sensorId).toBe(2);
    expect(parseLine("10,0,0,0,1", cfg).kind).toBe("error");
    expect(parseLine("10,3,0,0,1", { ...cfg, sensorIdBase: 0 }).kind).toBe("error");
  });
  it("uses configured extended column order and microseconds", () => {
    expect(parseLine("123456,9,0,9.80665,0,-9.80665,0,0,0,25", { ...cfg, columns: "timestamp_us,sample,sensor_id,ax,ay,az,gx,gy,gz,temperature_C", sensorIdBase: 0, inputUnit: "ms2" })).toEqual({ kind: "sample", detectedSensorId: 0, sample: { timestamp: 123.456, sensorId: 1, ax: 1, ay: 0, az: -1 } });
  });
  it("uses reordered fields and skips explicitly ignored values", () => {
    const result = parseLine("3;1;garbage;2;5000;4", { ...cfg, delimiter: ";", columns: "ay,sensor_id,_,ax,timestamp,az", timestampUnit: "us" });
    expect(result.kind === "sample" && result.sample).toEqual({ timestamp: 5, sensorId: 1, ax: 2, ay: 3, az: 4 });
  });
  it.each(["MPU6050 found on channel 2", "# startup", "timestamp,id,ax,ay,az", "sensor unavailable"])('keeps diagnostics separate: %s', (line) => expect(parseLine(line, cfg).kind).toBe("text"));
  it.each(["10,1,0,0", "10,1,0,0,1,extra", "10,1,,0,1", ",1,0,0,1", "NaN,1,0,0,1", "Infinity,1,0,0,1", "10,1,Infinity,0,1", "10,1,NaN,0,1", "10,1.5,0,0,1", "10,1,no,0,1"])('rejects malformed candidate: %s', (line) => expect(parseLine(line, cfg).kind).toBe("error"));
  it("validates status, version and rate independently", () => {
    expect(parseLine("STATUS,S0=OK,S1=FAIL,S2=OK", { ...cfg, sensorIdBase: 0 })).toEqual({ kind: "status", sensors: { 1: true, 2: false, 3: true } });
    expect(parseLine("FW,2.1", cfg)).toEqual({ kind: "firmware", version: "2.1" });
    expect(parseLine("RATE,100", cfg)).toEqual({ kind: "rate", hz: 100 });
    expect(parseLine("STATUS,S1=MAYBE", cfg).kind).toBe("error");
    expect(parseLine("FW,", cfg).kind).toBe("error");
    expect(parseLine("EXC,1,NaN", cfg).kind).toBe("error");
  });
  it("preserves timestamps including duplicate records", () => {
    const row = "1.25,1,0,0,1";
    expect(parseLine(row, cfg)).toEqual(parseLine(row, cfg));
    const result = parseLine(row, { ...cfg, timestampUnit: "s" });
    expect(result.kind === "sample" && result.sample.timestamp).toBe(1250);
  });
  it("normalizes m/s² exactly once through CSV round trip", () => {
    const parsed = parseCsv(`timestamp_us,sensor_id,ax_ms2,ay_ms2,az_ms2\n10000,1,${G},0,0`);
    expect(parsed.samples).toEqual([{ timestamp: 10, sensorId: 1, ax: 1, ay: 0, az: 0 }]);
    expect(parseCsv(rawCsv(parsed.samples)).samples).toEqual(parsed.samples);
  });
  it("CSV and serial agree for the extended zero-based protocol", () => {
    const protocol = { ...cfg, columns: "timestamp_us,sample,sensor_id,ax,ay,az,gx,gy,gz,temperature_C", sensorIdBase: 0 as const };
    const row = "10000,0,2,0,0,1,0,0,0,25";
    const serial = parseLine(row, protocol);
    expect(parseCsv(row, protocol).samples).toEqual(serial.kind === "sample" ? [serial.sample] : []);
  });
  it("canonical exported IDs remain one-based regardless of wire settings", () => {
    const samples = [1, 2, 3].map((sensorId) => ({ timestamp: 1, sensorId: sensorId as 1 | 2 | 3, ax: 1, ay: 0, az: 0 }));
    expect(parseCsv(rawCsv(samples), { ...cfg, sensorIdBase: 0, inputUnit: "ms2" }).samples).toEqual(samples);
  });
  it("buffers sample and CRLF boundaries split across reads", () => {
    const buffer = new LineBuffer();
    expect(buffer.push("10,1,0,")).toEqual([]);
    expect(buffer.push("0,1\r")).toEqual(["10,1,0,0,1"]);
    expect(buffer.push("\n20,2,0,0,1\n30,3,")).toEqual(["20,2,0,0,1"]);
    expect(buffer.push("0,0,1\r\n")).toEqual(["30,3,0,0,1"]);
  });
});
import { detectHeader as _detectHeader } from "./parser";
describe("firmware header detection", () => {
  it("recognizes the streaming sketch header", () => {
    expect(_detectHeader("timestamp_us,sensor_id,ax_g,ay_g,az_g", ",")).toBe("timestamp_us,sensor_id,ax_g,ay_g,az_g");
  });
  it("does not treat data rows as headers", () => {
    expect(_detectHeader("123456,1,0.01,0.02,0.98", ",")).toBeNull();
  });
});

import { parseLine as pl, STREAM_PROTOCOL as SP } from "./parser";
import { it as it2, expect as ex2 } from "vitest";
it2("parses DATA raw-count records (µs, ±2 g)", () => {
  const r = pl("DATA,38358719,3,-16384,1160,224", SP);
  ex2(r.kind).toBe("sample");
  if (r.kind === "sample") { ex2(r.sample.sensorId).toBe(3); ex2(r.sample.timestamp).toBeCloseTo(38358.719); ex2(r.sample.ax).toBeCloseTo(-1); }
  ex2(pl("DATA,1,4,0,0,0", SP).kind).toBe("error");
});
