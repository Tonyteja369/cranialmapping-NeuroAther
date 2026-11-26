import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ALIAS_FRACTION, fitAttenuation, relDb, sensorAmplitude, SNR_MIN_DB, snrDb, viridis, VIRIDIS_CSS, type Fit } from "@/lib/nsx/attenuation";
import { selectActiveData } from "@/lib/nsx/analysis";
import { dbLoadDataset } from "@/lib/nsx/db";
import { download, downloadDataUrl, fname, rawCsv } from "@/lib/nsx/io";
import { updateExperimentSkull, useNsx } from "@/lib/nsx/store";
import { SENSOR_IDS, type Sample, type SensorId, type SkullMarker, type SkullRecord, type SkullSite } from "@/lib/nsx/types";
import type { LoadedSkull, SceneMarker, ScenePath, V3 } from "./Skull3DScene";
import { fmt } from "./ui";

const Scene = lazy(() => import("./Skull3DScene"));
const SITE_NAME: Record<SkullMarker, string> = { "left-temporal": "subject-left temporal", "right-temporal": "subject-right temporal", frontal: "frontal midline", ref: "REF (next to TX)", tx: "TX occipital" };
const DEFAULT_SITES: Record<SensorId, SkullSite> = { 1: "left-temporal", 2: "right-temporal", 3: "frontal" };
const emptyRec = (): SkullRecord => ({ placement: {}, headLengthCm: 19, tapeCm: {}, baselineId: null });

/** oklch/any CSS colour → hex that three.js can parse. */
function cssHex(v: string) {
  const c = document.createElement("canvas"); c.width = c.height = 1;
  const x = c.getContext("2d")!; x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888"; x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
const rgbCss = (t: number) => `rgb(${viridis(t).map((n) => Math.round(n * 255)).join(",")})`;

interface Row { id: SensorId; site: SkullSite; amp: number; noise: number; snr: number; fs: number; aliased: boolean; measured: boolean; db: number; distCm: number; geoCm: number }

/** Real skull mesh with measured-only (A) or model-fit (B) attenuation overlay. */
export function Skull3D({ height = 320 }: { height?: number }) {
  const st = useNsx();
  const { samples, source } = selectActiveData(st);
  const exp = st.experiment;
  const sites = { ...DEFAULT_SITES, ...(st.settings.skullSites ?? {}) };
  const [mounted, setMounted] = useState(false);
  const [skull, setSkull] = useState<LoadedSkull | null>(null);
  const [rec, setRec] = useState<SkullRecord>(emptyRec);
  const [mode, setMode] = useState<"measured" | "model">("measured");
  const [debug, setDebug] = useState(false);
  const [full, setFull] = useState(false);
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setFull(false); window.addEventListener("keydown", k); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; }; }, [full]);
  const [calib, setCalib] = useState<SkullMarker | null>(null);
  const [fIdx, setFIdx] = useState(0);
  const [baseline, setBaseline] = useState<Sample[] | null>(null);
  const [geo, setGeo] = useState<{ vertexDist: Float32Array; paths: Record<string, { d: number; pts: number[] }> } | null>(null);
  const [colorsHex, setColorsHex] = useState<Record<string, string>>({});
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { setMounted(true); setColorsHex({ 1: cssHex("--sensor-1"), 2: cssHex("--sensor-2"), 3: cssHex("--sensor-3"), tx: cssHex("--analysis"), ref: "#e5e7eb" }); }, []);
  useEffect(() => { setRec({ ...emptyRec(), ...(exp?.skull ?? {}) }); }, [exp?.id]);
  useEffect(() => {
    let dead = false; setBaseline(null);
    if (rec.baselineId) dbLoadDataset(rec.baselineId).then((d) => !dead && setBaseline(d ?? null)).catch(() => toast.error("Could not load baseline recording"));
    return () => { dead = true; };
  }, [rec.baselineId]);

  const placement = useMemo(() => ({ ...(skull?.defaults ?? {}), ...rec.placement }) as Partial<Record<SkullMarker, V3>>, [skull, rec.placement]);
  const cmPerUnit = skull ? rec.headLengthCm / skull.zExtent : NaN;

  // Geodesic distances from TX in a Web Worker on a decimated graph.
  useEffect(() => {
    if (!skull || !placement.tx) return;
    const w = new Worker(new URL("../../lib/nsx/geodesic.worker.ts", import.meta.url), { type: "module" });
    const targets: Record<string, V3> = {};
    for (const id of SENSOR_IDS) { const p = placement[sites[id]]; if (p) targets[id] = p; }
    w.onmessage = (e) => { setGeo(e.data); w.terminate(); };
    w.onerror = () => { toast.error("Path-length calculation failed"); w.terminate(); };
    w.postMessage({ pos: skull.pos, index: skull.index, tx: placement.tx, targets, cell: 0.006 });
    return () => w.terminate();
  }, [skull, JSON.stringify(placement), JSON.stringify(sites)]);

  // Excitation frequencies: documented sweep steps (own window) + experiment excitation (whole recording).
  const freqs = useMemo(() => {
    const out: { f: number; win?: [number, number]; label: string }[] = [];
    for (const s of exp?.sweepSteps ?? []) if (s.verified) out.push({ f: s.actualHz ?? s.requestedHz, win: [s.tStartMs, s.tEndMs], label: "sweep step" });
    if (exp?.excitationHz) out.push({ f: exp.excitationHz, label: "experiment excitation" });
    return out.sort((a, b) => a.f - b.f);
  }, [exp]);
  const fsel = freqs[Math.min(fIdx, freqs.length - 1)];

  const rows: Row[] = useMemo(() => SENSOR_IDS.map((id) => {
    const site = sites[id];
    const r = fsel ? sensorAmplitude(samples, id, fsel.f, fsel.win) : { amp: NaN, fs: NaN };
    const noise = fsel && baseline ? sensorAmplitude(baseline, id, fsel.f).amp : NaN;
    const snr = snrDb(r.amp, noise);
    const aliased = !!fsel && isFinite(r.fs) && fsel.f > ALIAS_FRACTION * r.fs;
    const geoCm = geo?.paths[id] ? geo.paths[id].d * cmPerUnit : NaN;
    const tape = rec.tapeCm[id];
    return { id, site, amp: r.amp, noise, snr, fs: r.fs, aliased, measured: snr >= SNR_MIN_DB && !aliased, db: NaN, geoCm, distCm: tape && tape > 0 ? tape : geoCm };
  }), [samples, baseline, fsel, geo, cmPerUnit, rec.tapeCm, JSON.stringify(sites)]);

  const measured = rows.filter((r) => r.measured);
  const refRow = measured.find((r) => r.site === "ref") ?? [...measured].sort((a, b) => b.amp - a.amp)[0];
  const refLabel = refRow ? (refRow.site === "ref" ? `re REF (S${refRow.id})` : `relative to S${refRow.id}, not to the source`) : "";
  for (const r of rows) r.db = r.measured && refRow ? relDb(r.amp, refRow.amp) : NaN;
  const fit: Fit | null = fitAttenuation(measured.map((r) => ({ d: r.distCm, amp: r.amp })));
  const dbs = measured.map((r) => r.db);
  const lo = dbs.length ? Math.min(...dbs, -1) : -20, hi = dbs.length ? Math.max(...dbs) : 0;
  const tOf = (db: number) => (hi > lo ? (db - lo) / (hi - lo) : 1);

  const colors = useMemo(() => {
    if (mode !== "model" || !fit || !geo || !refRow) return null;
    const vd = geo.vertexDist, out = new Float32Array(vd.length * 3);
    for (let i = 0; i < vd.length; i++) {
      const d = vd[i] * cmPerUnit;
      if (!isFinite(d)) { out.set([0.62, 0.62, 0.62], i * 3); continue; }
      out.set(viridis(tOf(20 * Math.log10(Math.exp(fit.a + fit.b * d) / refRow.amp))), i * 3);
    }
    return out;
  }, [mode, fit?.a, fit?.b, geo, cmPerUnit, refRow?.amp, lo, hi]);

  const markers: SceneMarker[] = [];
  if (placement.tx) markers.push({ key: "tx", label: "TX", color: colorsHex.tx ?? "#a855f7", pos: placement.tx, tx: true });
  for (const r of rows) {
    const p = placement[r.site]; if (!p) continue;
    markers.push({ key: String(r.id), label: `S${r.id}${r.site === "ref" ? " REF" : ""}`, color: colorsHex[r.id] ?? "#888", pos: p, glow: mode === "measured" && r.measured ? rgbCss(tOf(r.db)) : null, sub: r.measured ? `${fmt(r.db, 1)} dB` : r.aliased ? "alias risk" : fsel ? "below noise floor" : undefined });
  }
  if (!rows.some((r) => r.site === "ref") && placement.ref && calib === "ref") markers.push({ key: "ref", label: "REF", color: "#e5e7eb", pos: placement.ref });
  const paths: ScenePath[] = rows.filter((r) => geo?.paths[r.id]).map((r) => ({ key: String(r.id), pts: geo!.paths[r.id].pts, label: `S${r.id} ${fmt(r.distCm, 1)} cm${r.measured ? ` · ${fmt(r.db, 1)} dB` : ""}` }));

  const save = async (next: SkullRecord) => {
    setRec(next);
    if (!exp) return;
    try { const saved = await updateExperimentSkull(next); if (saved) toast.success("Placement saved to experiment"); } catch (e) { toast.error((e as Error).message); }
  };
  const pick = (p: V3) => { if (calib) { void save({ ...rec, placement: { ...rec.placement, [calib]: p } }); setCalib(null); } };
  const simulated = source === "demo";

  const exportAll = async () => {
    const c = canvas.current; if (!c) { toast.error("3D view not ready"); return; }
    const out = document.createElement("canvas"); out.width = c.width; out.height = c.height + 60;
    const x = out.getContext("2d")!; x.fillStyle = "#ffffff"; x.fillRect(0, 0, out.width, out.height); x.drawImage(c, 0, 0);
    x.fillStyle = "#111"; x.font = "14px sans-serif";
    x.fillText(`${mode === "model" ? "MODEL (visualisation only)" : "Measured"} · ${fsel ? `${fsel.f} Hz` : "no excitation frequency"} · dB ${refLabel}`, 8, c.height + 20);
    x.fillText(fit ? `Fit ${fit.dbPerCm.toFixed(2)} dB/cm, R² ${fit.r2.toFixed(2)} — indicative only, n = ${fit.n}` : `No fit (n = ${measured.length})`, 8, c.height + 42);
    if (simulated) { x.save(); x.translate(out.width / 2, c.height / 2); x.rotate(-0.4); x.font = "bold 64px sans-serif"; x.fillStyle = "rgba(220,38,38,0.55)"; x.textAlign = "center"; x.fillText("SIMULATED", 0, 0); x.restore(); }
    downloadDataUrl(fname(exp, "SkullMap", "png"), out.toDataURL("image/png"));
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawCsv(samples)));
    const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    download(fname(exp, "SkullMap", "json"), JSON.stringify({
      experiment: exp?.id ?? null, source, simulated, model: "ScatteringSkull (CC0, Vladimir Petkovic / Khronos glTF Sample Assets)",
      headLengthCm: rec.headLengthCm, cmPerModelUnit: cmPerUnit, excitationHz: fsel?.f ?? null, window: fsel?.win ?? null,
      baselineExperiment: rec.baselineId, reference: refRow ? { sensor: refRow.id, label: refLabel } : null, snrThresholdDb: SNR_MIN_DB,
      positions: placement, sensors: rows.map((r) => ({ sensor: r.id, site: r.site, amplitudeG: r.amp, noiseFloorG: r.noise, snrDb: r.snr, measuredRateHz: r.fs, aliasRisk: r.aliased, measured: r.measured, dbRe: r.db, geodesicCm: r.geoCm, tapeCm: rec.tapeCm[r.id] ?? null, distanceUsedCm: r.distCm })),
      fit: fit ? { ...fit, note: `indicative only, n = ${fit.n}` } : null,
      rawDataSha256: hash, rawDataHashNote: "SHA-256 of the canonical raw CSV (timestamp,sensorId,ax,ay,az in g) of the active dataset",
    }, null, 2), "application/json");
  };

  const has = samples.length > 0;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className={full ? "fixed inset-0 z-50 bg-background p-2" : "relative w-full overflow-hidden rounded-lg border border-panel-border bg-secondary/40"} style={full ? undefined : { height: `clamp(240px, 55vh, ${Math.max(height, 420)}px)` }}>
        <button className="btn absolute right-2 bottom-2 z-10 h-7" onClick={() => setFull(!full)}>{full ? "Close (Esc)" : "Expand workspace"}</button>
        {mounted && <Suspense fallback={<div className="grid h-full place-items-center text-muted-foreground">Loading 3D viewer…</div>}>
          <Scene colors={colors} markers={has ? markers : markers.filter((m) => m.tx)} paths={has ? paths : []} debug={debug} calibrate={!!calib} simulated={simulated} zoom={full} onLoaded={setSkull} onPick={pick} onCanvas={(c) => (canvas.current = c)} />
        </Suspense>}
        {!has && <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-muted-foreground">No measured values — heat overlay hidden</div>}
        {mode === "model" && colors && <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded bg-warning/90 px-2 py-1 text-center text-[11px] font-semibold text-background">Model from {fit!.n} measured points — not measured, not internal anatomy, not diagnostic</div>}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{fmt(lo, 1)} dB</span><span className="h-2 flex-1 rounded" style={{ background: VIRIDIS_CSS }} /><span>{fmt(hi, 1)} dB</span>
      </div>
      <div className="text-[11px] text-muted-foreground">Drag to rotate · scroll the page freely · use Expand workspace to zoom</div>
      <div className="text-[11px] text-muted-foreground">{refRow ? `dB ${refLabel}` : "No reference — no sensor above noise floor"} · grey = no data</div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-panel-border">
          <button className={`px-2 py-1 ${mode === "measured" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setMode("measured")}>Measured</button>
          {fit && <button className={`px-2 py-1 ${mode === "model" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setMode("model")}>Model (visualisation only)</button>}
        </div>
        <label className="flex items-center gap-1"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />Axes</label>
        <button className="btn h-7" onClick={exportAll}>Export PNG + JSON</button>
      </div>

      {freqs.length > 0 ? (
        <label className="flex items-center gap-2">Excitation <input type="range" min={0} max={freqs.length - 1} value={Math.min(fIdx, freqs.length - 1)} onChange={(e) => setFIdx(+e.target.value)} className="flex-1" disabled={freqs.length < 2} />
          <span className="font-mono">{fsel.f} Hz</span><span className="text-muted-foreground">({fsel.label})</span></label>
      ) : <div className="text-muted-foreground">No documented excitation frequency (set it on the experiment or run a verified sweep) — amplitudes not computed.</div>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">Head length (cm)<input type="number" step="0.1" min={10} max={30} className="field h-7 w-16" value={rec.headLengthCm} onChange={(e) => +e.target.value > 0 && save({ ...rec, headLengthCm: +e.target.value })} /></label>
        <label className="flex items-center gap-1">Baseline (excitation off)<select className="field h-7 max-w-[150px]" value={rec.baselineId ?? ""} onChange={(e) => save({ ...rec, baselineId: e.target.value || null })}>
          <option value="">— none —</option>{st.experiments.filter((e) => e.id !== exp?.id).map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}</select></label>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span>Calibrate placement:</span>
        {(["tx", "left-temporal", "right-temporal", "frontal", "ref"] as SkullMarker[]).map((k) => (
          <button key={k} className={`btn h-6 ${calib === k ? "ring-2 ring-primary" : ""}`} onClick={() => setCalib(calib === k ? null : k)} title={SITE_NAME[k]}>{k === "tx" ? "TX" : k === "ref" ? "REF" : `S${SENSOR_IDS.find((i) => sites[i] === k) ?? "?"}`}</button>
        ))}
        {Object.keys(rec.placement).length > 0 && <button className="btn h-6" onClick={() => save({ ...rec, placement: {} })}>Reset</button>}
        {!exp && <span className="text-muted-foreground">(no experiment selected — not saved)</span>}
      </div>

      <table className="tbl"><thead><tr><th>Sensor</th><th>Amp (g)</th><th>SNR</th><th>dB</th><th>Path / tape (cm)</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.measured ? "" : "text-muted-foreground"}>
            <td style={{ color: `var(--sensor-${r.id})` }}>S{r.id} <span className="font-sans text-[10px] text-muted-foreground">{SITE_NAME[r.site]}</span></td>
            <td>{fmt(r.amp, 4)}</td><td>{isFinite(r.snr) ? `${r.snr.toFixed(1)} dB` : "—"}</td>
            <td>{r.measured ? fmt(r.db, 1) : r.aliased ? "alias risk" : fsel ? "below noise floor" : "—"}</td>
            <td className="flex items-center gap-1">{fmt(r.geoCm, 1)}<input type="number" step="0.1" placeholder="tape" className="field h-6 w-14" value={rec.tapeCm[r.id] ?? ""} onChange={(e) => save({ ...rec, tapeCm: { ...rec.tapeCm, [r.id]: e.target.value ? +e.target.value : undefined } })} /></td>
          </tr>
        ))}
      </tbody></table>
      {!baseline && <div className="text-muted-foreground">Select a baseline recording to compute noise floor and SNR; without it no sensor counts as measured.</div>}
      <div className="font-mono text-[11px]">{fit ? `Attenuation ${fit.dbPerCm.toFixed(2)} dB/cm · R² ${fit.r2.toFixed(2)} · indicative only, n = ${fit.n}` : `No attenuation fit — indicative only, n = ${measured.length} (needs ≥ 3)`}</div>
      {measured.map((r) => <div key={r.id} className="text-[11px]">Amplitude at S{r.id} was {r.db.toFixed(1)} dB {refLabel}, SNR {r.snr.toFixed(1)} dB.</div>)}
      <p className="text-[11px] text-muted-foreground">Positions are approximate 10-20-style scalp sites; paths are surface distances over the model, scaled by head length. Amplitude only — no arrival time or wave speed is measured. Not diagnostic.</p>
      <p className="text-[10px] text-muted-foreground">Skull model: “Scattering Skull” by Vladimir Petkovic, CC0, via Khronos glTF Sample Assets.</p>
    </div>
  );
}
