import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, get, newExperiment, openExperiment, saveExperiment, set, setActive, updateSettings } from "./store";
import { connect, disconnect, handleLines, pauseAcquisition, startAcquisition, stopAcquisition } from "./serial";
import { dbLoadDataset, dbSaveDataset } from "./db";
import { sensorStreamStatus, SENSOR_TIMEOUT_MS } from "./sensor-stream";
import { analyseDataset, selectActiveData, useAnalysis } from "./analysis";
import { STREAM_PROTOCOL } from "./parser";
import { act, renderHook, waitFor } from "@testing-library/react";
import { rawCsv } from "./io";
import { processSeries } from "./dsp";

beforeEach(() => {
  set({ settings: { ...defaultSettings, columns: "timestamp,id,ax,ay,az", timestampUnit: "ms" }, experiment: null, samples: [], preview: [], experiments: [], acquiring: false, paused: false, console: [], log: [], excitations: [], serial: { ...get().serial, supported: true, connected: true, firmware: null, reportedRate: null, lines: 0, validSamples: 0, parseErrors: 0, textLines: 0, sensorStatus: {}, lastSampleAt: {}, latestSample: {}, sampleCounts: {}, protocolDiagnostics: [] } });
});
describe("shared validated acquisition", () => {
  it("streams three sensors into one recording and selects that recording over newer preview data", async () => {
    set({ settings: { ...defaultSettings, ...STREAM_PROTOCOL } });
    startAcquisition();
    handleLines(["Collecting 256 samples...", "Sensor 1 | Mean = 0.99933 g | Dominant Frequency = 20.680 Hz", "FFT complete.", "STATUS,S1=OK,S2=OK,S3=OK"]);
    expect(get().samples).toEqual([]);
    const lines = Array.from({ length: 256 }, (_, i) => [1, 2, 3].map((id) => `${1000000 + i * 20000 + id * 100},${id},${0.1 * id * Math.sin(2 * Math.PI * 10 * i / 50)},0,1`)).flat();
    handleLines(lines, 5000);
    const recorded = get().samples;
    expect(recorded).toHaveLength(768);
    expect(get().serial.sampleCounts).toEqual({ 1: 256, 2: 256, 3: 256 });
    expect(get().serial.sensorStatus).toEqual({ 1: true, 2: true, 3: true });
    expect(get().serial.latestSample[3]?.timestamp).toBe(6100.3);
    expect(selectActiveData(get()).samples).toBe(recorded);
    const analysis = analyseDataset(recorded, get().settings, "ax", defaultSettings.sensorLabels);
    for (const sensor of analysis) {
      expect(sensor.series).toHaveLength(256);
      expect(sensor.fs).toBeCloseTo(50, 6);
      expect(sensor.peaks[0]?.freq).toBeCloseTo(9.9609375, 6);
    }
    stopAcquisition();
    await saveExperiment();
    const id = get().experiment?.id;
    expect(id).toBeTruthy();
    handleLines(["9999000,1,9,9,9"]);
    expect(selectActiveData(get()).samples).toBe(recorded);
    expect(selectActiveData(get(), "stream").samples.at(-1)?.ax).toBe(9);
    setActive(null, [], null);
    if (id) await openExperiment(id);
    expect(selectActiveData(get()).samples).toEqual(recorded);
    expect(get().experiment?.acquisitionProtocol).toMatchObject(STREAM_PROTOCOL);
  });
  it("refreshes React analysis after ingress, settings and selected calibration changes", async () => {
    const { result, unmount } = renderHook(() => useAnalysis("ax"));
    act(() => handleLines(["10,1,2,0,1"]));
    await waitFor(() => expect(result.current.sensors[0].raw).toEqual([2]));
    act(() => updateSettings({ displayUnit: "ms2" }));
    await waitFor(() => expect(result.current.sensors[0].raw[0]).toBeCloseTo(19.6133, 6));
    act(() => {
      set({ settings: { ...get().settings, displayUnit: "g", baseline: "none" } });
      setActive(newExperiment({ calibration: { timestamp: "2026-10-17", method: "stationary", orientationNotes: "test", applied: true, offsets: { 1: { ax: 1, ay: 0, az: 0 }, 2: { ax: 0, ay: 0, az: 0 }, 3: { ax: 0, ay: 0, az: 0 } } } }), [{ timestamp: 20, sensorId: 1, ax: 3, ay: 0, az: 1 }], "live");
    });
    await waitFor(() => expect(result.current.sensors[0].processed).toEqual([2]));
    expect(result.current.sensors[0].raw).toEqual([3]);
    unmount();
  });
  it("updates latest axes, sensor counts, status and diagnostics from the same ingress", () => {
    handleLines(["booting", "FW,1.2", "STATUS,S1=OK,S2=OK,S3=FAIL", "100,1,1,2,3", "101,2,4,5,6", "102,3,7,8,9", "103,1,,0,1"], 5000);
    const s = get();
    expect(s.serial.validSamples).toBe(3);
    expect(s.serial.textLines).toBe(1);
    expect(s.serial.parseErrors).toBe(1);
    expect(s.serial.firmware).toBe("1.2");
    expect(s.serial.sampleCounts).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(s.serial.latestSample[2]).toEqual({ timestamp: 101, sensorId: 2, ax: 4, ay: 5, az: 6 });
    expect(s.serial.lastSampleAt[2]).toBe(5000);
    expect(s.serial.sensorStatus[3]).toBe(false);
    expect(s.preview).toHaveLength(3);
    expect(s.samples).toHaveLength(0);
    expect(s.serial.protocolDiagnostics.at(-1)?.result.kind).toBe("error");
  });
  it("does not infer initialization from samples or connection", () => {
    handleLines(["1,1,0,0,1"]);
    expect(get().serial.sensorStatus).toEqual({});
    expect(get().serial.firmware).toBeNull();
  });
  it("preserves device time and duplicates while reporting quality", () => {
    startAcquisition();
    handleLines(["123.4,1,0,0,1", "123.4,1,0,0,1"], 900000);
    expect(get().samples.map((s) => s.timestamp)).toEqual([123.4, 123.4]);
    expect(analyseDataset(get().samples, defaultSettings, "az", defaultSettings.sensorLabels)[0].q.duplicates).toBe(1);
  });
  it("start, pause, resume, stop and save retain one experiment and raw samples", async () => {
    const draft = newExperiment({ title: "Real recording draft" });
    setActive(draft, [], "live");
    startAcquisition();
    expect(get().experiment?.id).toBe(draft.id);
    handleLines(["10,1,0.1,0.2,1"]);
    const firstSnapshot = get().samples;
    pauseAcquisition(true);
    handleLines(["20,2,0,0,1"]);
    expect(get().samples).toHaveLength(1);
    pauseAcquisition(false);
    handleLines(["30,3,0.3,0.4,1"]);
    expect(firstSnapshot).toHaveLength(1);
    await expect(saveExperiment()).rejects.toThrow("Stop acquisition");
    stopAcquisition();
    const stopped = get().experiment;
    expect(stopped?.id).toBe(draft.id);
    expect(stopped?.acqEnd).toBeTruthy();
    expect(stopped?.acquisitionEvents?.map((e) => e.action)).toEqual(["start", "pause", "resume", "stop"]);
    expect(stopped?.acquisitionProtocol).toMatchObject({ timestampSource: "device", storedUnit: "g", sensorIdBase: 1 });
    handleLines(["40,1,0,0,1"]);
    expect(get().samples.map((s) => s.timestamp)).toEqual([10, 30]);
    await saveExperiment();
    const saved = await dbLoadDataset(draft.id);
    expect(saved).toEqual(get().samples);
    expect(rawCsv(saved ?? [])).toContain("30,3,0.3,0.4,1");
    setActive(null, [], null);
    await openExperiment(draft.id);
    expect(get().samples).toEqual(saved);
    expect(get().experiment?.acquisitionEvents).toEqual(stopped?.acquisitionEvents);
  });
  it("rejects replacing datasets and changing protocol during acquisition", () => {
    startAcquisition();
    expect(() => setActive(null, [], null)).toThrow("Stop acquisition");
    expect(() => updateSettings({ sensorIdBase: 0 })).toThrow("Disconnect");
    expect(() => startAcquisition()).toThrow("already running");
  });
  it("signals stale at exactly three seconds independently for each sensor", () => {
    expect(SENSOR_TIMEOUT_MS).toBe(3000);
    expect(sensorStreamStatus(true, undefined, 5000)).toBe("no data");
    expect(sensorStreamStatus(true, 0, 2999)).toBe("receiving");
    expect(sensorStreamStatus(true, 0, 3000)).toBe("stale");
    expect(sensorStreamStatus(true, 2900, 3000)).toBe("receiving");
    expect(sensorStreamStatus(false, 2900, 3000)).toBe("disconnected");
  });
  it("keeps calibrated raw readings unchanged", () => {
    const sample = { timestamp: 1, sensorId: 1 as const, ax: 2, ay: 0, az: 1 };
    const processed = processSeries([sample], "ax", { ...defaultSettings, baseline: "none" }, 100, { ax: 1, ay: 0, az: 0 });
    expect(processed.raw).toEqual([2]);
    expect(processed.processed).toEqual([1]);
    expect(sample.ax).toBe(2);
  });
  it("loads old persisted t/s recordings without fabricating fields", async () => {
    await dbSaveDataset("legacy", [{ t: 25, s: 2, ax: 0, ay: 0, az: 1 }] as unknown as Parameters<typeof dbSaveDataset>[1]);
    expect(await dbLoadDataset("legacy")).toEqual([{ timestamp: 25, sensorId: 2, ax: 0, ay: 0, az: 1 }]);
  });
  it("handles actual reader chunk boundaries and releases its lock on disconnect", async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let closeCount = 0;
    const readable = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    Object.defineProperty(navigator, "serial", { configurable: true, value: { requestPort: async () => ({ readable, writable: null, open: async (config: { baudRate: number }) => { expect(config.baudRate).toBe(115200); }, close: async () => { expect(readable.locked).toBe(false); closeCount++; }, getInfo: () => ({}) }) } });
    set({ serial: { ...get().serial, connected: false } });
    await connect();
    startAcquisition();
    controller?.enqueue(new TextEncoder().encode("FW,9\n10,1,0,"));
    controller?.enqueue(new TextEncoder().encode("0,1\r"));
    controller?.enqueue(new TextEncoder().encode("\n11,2,0,0,1\n12,3,0,0,1\n"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(get().samples.map((s) => s.sensorId)).toEqual([1, 2, 3]);
    await disconnect();
    expect(closeCount).toBe(1);
    expect(get().serial.connected).toBe(false);
    expect(get().acquiring).toBe(false);
    expect(get().experiment?.acqEnd).toBeTruthy();
  });
  it("does not revive a connection canceled while the picker is open", async () => {
    let resolvePort: ((value: unknown) => void) | undefined;
    let openCount = 0;
    Object.defineProperty(navigator, "serial", { configurable: true, value: { requestPort: () => new Promise((resolve) => { resolvePort = resolve; }) } });
    set({ serial: { ...get().serial, connected: false } });
    const pending = connect();
    await disconnect();
    resolvePort?.({ open: async () => { openCount++; }, close: async () => {}, readable: null, getInfo: () => ({}) });
    await pending;
    expect(openCount).toBe(0);
    expect(get().serial.connected).toBe(false);
  });
});
import { selectActiveData as _select } from "./analysis";
describe("live data visibility", () => {
  it("shows the live stream when the selected experiment is empty", () => {
    const s = { serial: { connected: true }, experiment: { id: "E" }, acquiring: false, samples: [], preview: [{ timestamp: 1, sensorId: 1, ax: 0, ay: 0, az: 1 }], source: "live" } as never;
    expect(_select(s).usingPreview).toBe(true);
  });
});
