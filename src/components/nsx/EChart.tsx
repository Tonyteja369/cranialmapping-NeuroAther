import { useEffect, useRef } from "react";
import type { EChartsOption, ECharts } from "echarts";

/** ECharts wrapper (lazy-loaded, browser only). Includes zoom/pan, tooltip, PNG export toolbox. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EChart({ option, height = 280, onReady }: { option: EChartsOption | Record<string, any>; height?: number; onReady?: (c: ECharts) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    import("echarts").then((ec) => {
      if (disposed || !ref.current) return;
      chart.current = ec.init(ref.current, undefined, { renderer: "canvas" });
      chart.current.setOption(withDefaults(option));
      onReady?.(chart.current);
      ro = new ResizeObserver(() => chart.current?.resize());
      ro.observe(ref.current);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chart.current?.setOption(withDefaults(option), { notMerge: true, lazyUpdate: true });
  }, [option]);
  return <div ref={ref} style={{ height, width: "100%" }} />;
}

const css = (v: string) => (typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(v).trim() : "");

export const seriesColors = () => [css("--sensor-1"), css("--sensor-2"), css("--sensor-3"), css("--analysis")];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDefaults(o: any): EChartsOption {
  const fg = css("--muted-foreground");
  const grid = css("--border");
  const axisStyle = { axisLine: { lineStyle: { color: grid } }, axisLabel: { color: fg, fontSize: 10 }, splitLine: { lineStyle: { color: grid, type: "dashed" as const } }, nameTextStyle: { color: fg, fontSize: 10 } };
  const fix = (a: unknown) => (Array.isArray(a) ? a.map((x) => ({ ...axisStyle, ...x })) : a ? { ...axisStyle, ...(a as object) } : a);
  return {
    color: seriesColors(),
    animation: false,
    textStyle: { fontFamily: "IBM Plex Sans, sans-serif" },
    grid: { left: 56, right: 20, top: 48, bottom: 56, ...(o.grid as object) },
    tooltip: { trigger: "axis", ...(o.tooltip as object) },
    legend: { top: 4, left: 8, textStyle: { fontSize: 10, color: fg }, ...(o.legend as object) },
    toolbox: { right: 8, top: 0, itemSize: 12, feature: { dataZoom: {}, restore: {}, saveAsImage: { name: "NeuroSenseX_chart", pixelRatio: 2, backgroundColor: "#fff" } } },
    dataZoom: o.dataZoom ?? [{ type: "inside" }, { type: "slider", height: 14, bottom: 6 }],
    ...o,
    xAxis: fix(o.xAxis) as EChartsOption["xAxis"],
    yAxis: fix(o.yAxis) as EChartsOption["yAxis"],
  } as EChartsOption;
}
