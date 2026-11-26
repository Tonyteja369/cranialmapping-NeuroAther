import { useRef } from "react";
import { toast } from "sonner";
import { FlaskConical, Upload } from "lucide-react";
import { demoSamples, parseCsv } from "@/lib/nsx/io";
import { useNsx, get, log, newExperiment, setActive } from "@/lib/nsx/store";


export function ImportCsvButton() {
  const { acquiring } = useNsx();
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (f: File) => {
    if (get().acquiring) { toast.error("Stop acquisition before importing"); return; }
    const { samples, errors, unit } = parseCsv(await f.text(), get().settings);
    if (!samples.length) { toast.error(errors[0] ?? "No valid rows"); return; }
    const exp = newExperiment({ title: f.name.replace(/\.csv$/i, ""), source: "imported", notes: `Imported from ${f.name}. Unit detected: ${unit === "unknown" ? "not stated — assumed g" : unit}. ${errors.length} rejected rows.` });
    setActive(exp, samples, "imported");
    errors.forEach((e) => log("warn", `CSV: ${e}`));
    toast.success(`Imported ${samples.length} samples${errors.length ? `, ${errors.length} rows rejected` : ""}. Save the experiment to keep it.`);
  };
  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <button className="btn" disabled={acquiring} onClick={() => ref.current?.click()}><Upload className="h-3.5 w-3.5" />Import CSV</button>
    </>
  );
}

export function DemoButton() {
  const state = useNsx();
  const isDemo = state.source === "demo";
  return isDemo ? (
    <button className="btn" disabled={state.acquiring} onClick={() => setActive(null, [], null)}>Disable demo data</button>
  ) : (
    <button className="btn" disabled={state.acquiring} title="Loads a clearly-labelled synthetic dataset" onClick={() => setActive(newExperiment({ title: "DEMO — synthetic dataset", source: "demo", decayStartMs: 14000, notes: "Synthetic demonstration data. Not a measurement." }), demoSamples(), "demo")}>
      <FlaskConical className="h-3.5 w-3.5" />Load demo data
    </button>
  );
}
