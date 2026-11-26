import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Page, Panel, SourceTag, Empty } from "@/components/nsx/ui";
import { ImportCsvButton, DemoButton } from "@/components/nsx/DataActions";
import { head } from "@/lib/nsx/head";
import { deleteExperiment, duplicateExperiment, newExperiment, openExperiment, saveExperiment, set, setActive, useNsx } from "@/lib/nsx/store";
import { dbLoadDataset } from "@/lib/nsx/db";
import { download, downloadXlsx, fname, rawCsv } from "@/lib/nsx/io";
import { experimentJson, experimentSheets } from "@/lib/nsx/exports";
import { datasetSpan } from "@/lib/nsx/analysis";
import type { Experiment } from "@/lib/nsx/types";

export const Route = createFileRoute("/experiments")({
  head: head("Experiments", "Create, save, open, duplicate, export and delete Neuro Ather experiments stored in your browser."),
  component: Experiments,
});

function Experiments() {
  const s = useNsx();
  const e = s.experiment;
  const [confirm, setConfirm] = useState<string | null>(null);
  const upd = (p: Partial<Experiment>) => e && set({ experiment: { ...e, ...p } });
  const span = datasetSpan(s.samples);
  const exportExp = async (x: Experiment, fmt: "csv" | "json" | "xlsx") => {
    const data = x.id === e?.id ? s.samples : (await dbLoadDataset(x.id)) ?? [];
    if (!data.length) { toast.error(`${x.id} has no stored samples to export`); return; }
    if (fmt === "csv") download(fname(x, "RawData", "csv"), rawCsv(data), "text/csv");
    else if (fmt === "json") download(fname(x, "Data", "json"), experimentJson(x, data), "application/json");
    else await downloadXlsx(fname(x, "Dataset", "xlsx"), experimentSheets(x, data));
  };
  return (
    <Page title="Experiments" subtitle="Experiments and datasets are stored in this browser (IndexedDB) and survive page refreshes." actions={<>
      <button className="btn btn-primary" disabled={s.acquiring} onClick={() => setActive(newExperiment({ source: "live" }), [], "live")}>Create experiment</button><ImportCsvButton /><DemoButton /></>}>
      <Panel title="Active experiment" right={e && <><SourceTag source={s.source} /><button className="btn btn-primary" disabled={s.acquiring} onClick={async () => { try { await saveExperiment({ ...e, quality: e.quality }); toast.success("Saved"); } catch (er) { toast.error((er as Error).message); } }}>Save experiment</button><Link to="/hardware" className="btn">Acquisition controls</Link></>}>
        {!e ? <Empty title="No active experiment">Create one, import a CSV or open a saved experiment.</Empty> : (
          <div className="grid gap-3 md:grid-cols-3">
            <label className="lbl">ID<input className="field font-mono" value={e.id} readOnly /></label>
            <label className="lbl">Title<input className="field" value={e.title} onChange={(v) => upd({ title: v.target.value })} /></label>
            <label className="lbl">Objective<input className="field" value={e.objective} onChange={(v) => upd({ objective: v.target.value })} /></label>
            {([1, 2, 3] as const).map((id) => <label key={id} className="lbl">Sensor {id} location label<input className="field" value={e.sensorLabels[id]} onChange={(v) => upd({ sensorLabels: { ...e.sensorLabels, [id]: v.target.value } })} /></label>)}
            <label className="lbl">Configured sampling (Hz)<input className="field" type="number" value={e.nominalRateHz} onChange={(v) => upd({ nominalRateHz: +v.target.value })} /></label>
            <label className="lbl">Excitation frequency (Hz, if any)<input className="field" type="number" value={e.excitationHz ?? ""} onChange={(v) => upd({ excitationHz: v.target.value === "" ? null : +v.target.value })} /></label>
            <label className="lbl">Excitation waveform<select className="field" value={e.excitationWaveform} onChange={(v) => upd({ excitationWaveform: v.target.value })}>{["none", "sine", "stepped sine", "linear sweep", "log sweep", "impulse/tap"].map((w) => <option key={w}>{w}</option>)}</select></label>
            <label className="lbl">Dataset quality<select className="field" value={e.quality} onChange={(v) => upd({ quality: v.target.value as Experiment["quality"] })}>{["unknown", "good", "warning", "invalid"].map((w) => <option key={w}>{w}</option>)}</select></label>
            <label className="lbl md:col-span-2">Notes<textarea className="field h-16 py-1" value={e.notes} onChange={(v) => upd({ notes: v.target.value })} /></label>
            <div className="text-xs text-muted-foreground">Created {new Date(e.createdAt).toLocaleString()}<br />Acq. {e.acqStart ? new Date(e.acqStart).toLocaleTimeString() : "â€”"} â†’ {e.acqEnd ? new Date(e.acqEnd).toLocaleTimeString() : "â€”"}<br />{s.samples.length} samples Â· {span ? span.durS.toFixed(2) : 0} s</div>
          </div>
        )}
      </Panel>
      <Panel title={`Saved experiments (${s.experiments.length})`} right={<Link to="/comparison" className="btn">Compare experiments</Link>}>
        {s.experiments.length ? (
          <table className="tbl"><thead><tr><th>ID</th><th>Title</th><th>Created</th><th>Source</th><th>Rate</th><th>Quality</th><th></th></tr></thead><tbody>
            {s.experiments.map((x) => (
              <tr key={x.id} className={x.id === e?.id ? "bg-accent/50" : ""}><td>{x.id}</td><td className="font-sans">{x.title}</td><td>{new Date(x.createdAt).toLocaleDateString()}</td><td><SourceTag source={x.source} /></td><td>{x.nominalRateHz} Hz</td><td className="font-sans">{x.quality}</td>
                <td className="flex flex-wrap gap-1">
                  <button className="btn h-6" onClick={() => openExperiment(x.id)}>Open</button>
                  <button className="btn h-6" onClick={() => duplicateExperiment(x.id)}>Duplicate</button>
                  {(["csv", "json", "xlsx"] as const).map((k) => <button key={k} className="btn h-6" onClick={() => exportExp(x, k).catch((er) => toast.error((er as Error).message))}>{k.toUpperCase()}</button>)}
                  {confirm === x.id ? <><button className="btn btn-danger h-6" onClick={() => { deleteExperiment(x.id); setConfirm(null); }}>Confirm delete</button><button className="btn h-6" onClick={() => setConfirm(null)}>Cancel</button></> : <button className="btn btn-danger h-6" onClick={() => setConfirm(x.id)}>Delete</button>}
                </td></tr>
            ))}
          </tbody></table>
        ) : <Empty title="No saved experiments yet" />}
      </Panel>
    </Page>
  );
}
