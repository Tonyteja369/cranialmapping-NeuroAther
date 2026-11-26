import { buildGraph, dijkstra, nearestNode } from "./attenuation";

/** Geodesic distance from TX over a decimated mesh graph (model units). */
self.onmessage = (e: MessageEvent<{ pos: Float32Array; index: Uint32Array | null; tx: [number, number, number]; targets: Record<string, [number, number, number]>; cell: number }>) => {
  const { pos, index, tx, targets, cell } = e.data;
  const g = buildGraph(pos, index, cell);
  const { dist, prev } = dijkstra(g.offs, g.nbr, g.w, nearestNode(g.cen, tx));
  const vertexDist = new Float32Array(g.cl.length);
  for (let i = 0; i < g.cl.length; i++) vertexDist[i] = dist[g.cl[i]];
  const paths: Record<string, { d: number; pts: number[] }> = {};
  for (const [k, p] of Object.entries(targets)) {
    let n = nearestNode(g.cen, p);
    const d = dist[n], pts: number[] = [];
    while (n >= 0 && isFinite(d)) { pts.push(g.cen[n * 3], g.cen[n * 3 + 1], g.cen[n * 3 + 2]); n = prev[n]; }
    paths[k] = { d, pts };
  }
  (self as unknown as Worker).postMessage({ vertexDist, paths, nodes: g.offs.length - 1 }, [vertexDist.buffer]);
};
