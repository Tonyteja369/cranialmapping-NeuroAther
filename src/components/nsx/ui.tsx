import type { ReactNode } from "react";
import type { Axis, DataSource, SensorId } from "@/lib/nsx/types";
import { AXES } from "@/lib/nsx/types";

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export function SourceTag({ source, preview }: { source: DataSource | null; preview?: boolean }) {
  if (!source) return <span className="tag tag-muted">No dataset</span>;
  if (source === "demo") return <span className="tag tag-demo">DEMO DATA — synthetic, not a measurement</span>;
  if (source === "imported") return <span className="tag tag-imported">Imported experiment data</span>;
  return <span className="tag tag-live">● Live hardware data{preview ? " (preview buffer)" : ""}</span>;
}

export function QualityTag({ status }: { status: string }) {
  const cls = status === "good" ? "tag-live" : status === "warning" ? "tag-warn" : status === "invalid" ? "tag-bad" : "tag-muted";
  return <span className={`tag ${cls}`}>{status}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Metric({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode }) {
  return (
    <div className="panel flex flex-col gap-1">
      <div className="panel-title">{label}</div>
      <div className="metric">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export const fmt = (v: number, d = 4) => (isFinite(v) ? (Math.abs(v) >= 1000 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toFixed(d)) : "—");

export function SensorSelect({ value, onChange, allowAll }: { value: SensorId | "all"; onChange: (v: SensorId | "all") => void; allowAll?: boolean }) {
  return (
    <label className="lbl">
      Sensor
      <select className="field" value={value} onChange={(e) => onChange(e.target.value === "all" ? "all" : (Number(e.target.value) as SensorId))}>
        {allowAll && <option value="all">All three (comparison)</option>}
        <option value={1}>Sensor 1</option>
        <option value={2}>Sensor 2</option>
        <option value={3}>Sensor 3</option>
      </select>
    </label>
  );
}
export function AxisSelect({ value, onChange }: { value: Axis; onChange: (a: Axis) => void }) {
  return (
    <label className="lbl">
      Axis
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as Axis)}>
        {AXES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </label>
  );
}

export function Panel({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="panel-title">{title}</h2>}
          <div className="flex flex-wrap items-center gap-2">{right}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export const SYNC_WARNING =
  "Sensors are read sequentially through the TCA9548A multiplexer; samples from different sensors are not simultaneous. Phase and time-delay comparisons are not supported; correlations use interpolation onto a common grid.";
export const NO_MEDICAL = "Research prototype — experimental observations only. Not a medical device; provides no diagnosis.";
