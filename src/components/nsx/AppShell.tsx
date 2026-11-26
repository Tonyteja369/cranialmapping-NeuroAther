import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity, AudioWaveform, Bell, BrainCircuit, Cpu, FileText, FlaskConical, Gauge, GitCompare, LayoutDashboard, Map, PanelLeftClose,
  PanelLeftOpen, Radar, Settings, Sigma, Stethoscope, Usb, Waves, Wrench, Crosshair,
} from "lucide-react";
import { initStore, useNsx } from "@/lib/nsx/store";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/hardware", label: "Hardware Connection", icon: Usb },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/live", label: "Live Monitoring", icon: Activity },
  { to: "/processing", label: "Signal Processing", icon: Sigma },
  { to: "/sweep", label: "Frequency Sweep", icon: AudioWaveform },
  { to: "/resonance", label: "Resonance Analysis", icon: Waves },
  { to: "/map", label: "Mechanical Resonance Map", icon: Map },
  { to: "/comparison", label: "Sensor Comparison", icon: GitCompare },
  { to: "/ai", label: "AI Analysis", icon: BrainCircuit },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
  { to: "/calibration", label: "Calibration", icon: Crosshair },
  { to: "/firmware", label: "Firmware & Protocol", icon: Cpu },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const s = useNsx();
  const path = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => { initStore(); }, []);
  const warnCount = s.log.filter((l) => l.level !== "info").length;
  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] ${collapsed ? "w-14" : "w-60"}`}>
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Radar className="h-4 w-4" /></div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Neuro Ather</div>
              <div className="text-[10px] text-muted-foreground">Cranial Resonance Lab</div>
            </div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link key={to} to={to} title={label}
                className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] ${active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"}`}>
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-sensor-1" : ""}`} />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
        <button className="m-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-card/90 px-5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Experiment</span>
            <span className="truncate font-mono font-medium">{s.experiment ? `${s.experiment.id} Â· ${s.experiment.title}` : "none active"}</span>
            {s.source === "demo" && <span className="tag tag-demo">DEMO</span>}
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.serial.connected ? "bg-success" : "bg-muted-foreground/40"}`} />
              ESP32 {s.serial.connected ? "connected" : "disconnected"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.acquiring ? (s.paused ? "bg-warning" : "animate-pulse bg-sensor-1") : "bg-muted-foreground/40"}`} />
              {s.acquiring ? (s.paused ? "Paused" : "Acquiring") : "Idle"}
            </span>
            <Link to="/diagnostics" className="relative rounded-md p-1.5 hover:bg-secondary" title="Notifications">
              <Bell className="h-4 w-4" />
              {warnCount > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-destructive px-1 text-[9px] text-destructive-foreground">{Math.min(warnCount, 99)}</span>}
            </Link>
            <Link to="/settings" className="rounded-md p-1.5 hover:bg-secondary" title="Settings"><Wrench className="h-4 w-4" /></Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
