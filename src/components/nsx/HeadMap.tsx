import type { SensorId } from "@/lib/nsx/types";
import { fmt, QualityTag } from "./ui";

export const POSITIONS: Record<string, { x: number; y: number; name: string }> = {
  frontal: { x: 150, y: 52, name: "Frontal (midline)" },
  "left-temporal": { x: 58, y: 150, name: "Left temporal" },
  "right-temporal": { x: 242, y: 150, name: "Right temporal" },
  "left-mastoid": { x: 78, y: 222, name: "Left mastoid" },
  "right-mastoid": { x: 222, y: 222, name: "Right mastoid" },
  vertex: { x: 150, y: 140, name: "Vertex" },
  occipital: { x: 150, y: 255, name: "Occipital (midline)" },
  "left-parietal": { x: 95, y: 95, name: "Left parietal" },
  "right-parietal": { x: 205, y: 95, name: "Right parietal" },
};
export const defaultPositions: Record<SensorId, string> = { 1: "left-temporal", 2: "right-temporal", 3: "occipital" };

export interface MapValue { id: SensorId; label: string; value: number; quality: string }

/** Top-view simplified head with three directly-measured sensor markers. No interpolation. */
export function HeadMap({ values, positions, unit, metricName, onSelect, selected, id = "nsx-headmap" }: {
  values: MapValue[]; positions: Record<SensorId, string>; unit: string; metricName: string; onSelect?: (id: SensorId) => void; selected?: SensorId; id?: string;
}) {
  const finite = values.map((v) => v.value).filter(isFinite);
  const max = finite.length ? Math.max(...finite) : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg id={id} viewBox="0 0 300 300" className="w-full max-w-[340px]" role="img" aria-label="Three-location mechanical response map">
        <rect width="300" height="300" fill="var(--card)" />
        <ellipse cx="150" cy="150" rx="112" ry="128" fill="var(--secondary)" stroke="var(--panel-border)" strokeWidth="1.5" />
        <path d="M138 24 L150 6 L162 24" fill="var(--secondary)" stroke="var(--panel-border)" strokeWidth="1.5" />
        <ellipse cx="36" cy="150" rx="8" ry="22" fill="var(--secondary)" stroke="var(--panel-border)" />
        <ellipse cx="264" cy="150" rx="8" ry="22" fill="var(--secondary)" stroke="var(--panel-border)" />
        <line x1="150" y1="30" x2="150" y2="276" stroke="var(--border)" strokeDasharray="3 4" />
        <text x="150" y="294" textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">Top view · nose up · schematic</text>
        {values.map((v) => {
          const p = POSITIONS[positions[v.id]] ?? POSITIONS.vertex;
          const r = isFinite(v.value) && max > 0 ? 10 + 18 * (v.value / max) : 9;
          const color = `var(--sensor-${v.id})`;
          return (
            <g key={v.id} onClick={() => onSelect?.(v.id)} style={{ cursor: onSelect ? "pointer" : undefined }}>
              <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={isFinite(v.value) ? 0.25 : 0.05} stroke={color} strokeWidth={selected === v.id ? 3 : 1.5} />
              <circle cx={p.x} cy={p.y} r="3.5" fill={color} />
              <text x={p.x} y={p.y - r - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--foreground)">S{v.id}</text>
              <text x={p.x} y={p.y + r + 11} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="var(--foreground)">{isFinite(v.value) ? fmt(v.value, 4) : "no data"}</text>
            </g>
          );
        })}
      </svg>
      <div className="w-full text-[11px] text-muted-foreground">
        <b className="text-foreground">{metricName}</b> ({unit}). Marker area ∝ value relative to the largest of the three. Values are measured only at these three locations; no spatial interpolation is performed.
      </div>
      <div className="grid w-full gap-1">
        {values.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
            <span><span className="font-semibold" style={{ color: `var(--sensor-${v.id})` }}>S{v.id}</span> {v.label} · {POSITIONS[positions[v.id]]?.name}</span>
            <span className="flex items-center gap-2 font-mono">{fmt(v.value)} {unit} <QualityTag status={v.quality} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}
