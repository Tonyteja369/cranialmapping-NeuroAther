import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SkullMarker } from "@/lib/nsx/types";

export const SKULL_URLS = [
  "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb",
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb",
];
const GREY = 0.62;

export type V3 = [number, number, number];
export interface LoadedSkull { pos: Float32Array; index: Uint32Array | null; zExtent: number; defaults: Partial<Record<SkullMarker, V3>> }
export interface SceneMarker { key: string; label: string; color: string; pos: V3; tx?: boolean; glow?: string | null; sub?: string }
export interface ScenePath { key: string; pts: number[]; label: string }

// Default 10-20-style rays (origin, direction) in centred model coords.
const RAYS: Record<SkullMarker, [V3, V3]> = {
  "left-temporal": [[0.3, 0.03, 0.03], [-1, 0, 0]],
  "right-temporal": [[-0.3, 0.03, 0.03], [1, 0, 0]],
  frontal: [[0, 0.09, 0.4], [0, 0, -1]],
  tx: [[0, 0, -0.4], [0, 0, 1]],
  ref: [[0.03, 0, -0.4], [0, 0, 1]],
};

function bake(gltf: { scene: THREE.Object3D }) {
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) throw new Error("No mesh in file");
  const m = mesh as THREE.Mesh;
  const src = m.geometry as THREE.BufferGeometry;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", src.getAttribute("position").clone());
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(m.matrixWorld); // bake node transform
  g.computeBoundingBox();
  const c = new THREE.Vector3(); g.boundingBox!.getCenter(c); g.translate(-c.x, -c.y, -c.z);
  g.computeVertexNormals(); g.computeBoundingBox();
  const n = g.getAttribute("position").count;
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(GREY), 3));
  const tmp = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const rc = new THREE.Raycaster(), defaults: LoadedSkull["defaults"] = {};
  for (const [k, [o, d]] of Object.entries(RAYS)) {
    rc.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
    const hit = rc.intersectObject(tmp)[0];
    if (hit) defaults[k as SkullMarker] = [hit.point.x, hit.point.y, hit.point.z];
  }
  const bb = g.boundingBox!;
  return { geometry: g, info: { pos: g.getAttribute("position").array as Float32Array, index: g.index ? Uint32Array.from(g.index.array) : null, zExtent: bb.max.z - bb.min.z, defaults } };
}

function Axes() {
  const L = 0.22;
  const lab = (p: V3, t: string) => <Html position={p} center><span className="whitespace-nowrap rounded bg-background/80 px-1 font-mono text-[10px] font-bold">{t}</span></Html>;
  return (
    <group>
      <axesHelper args={[L]} />
      {lab([0, 0, L], "F (+Z face)")}{lab([0, 0, -L], "B (back)")}{lab([L, 0, 0], "L (subject left, +X)")}{lab([-L, 0, 0], "R (subject right, -X)")}{lab([0, L, 0], "Up +Y")}
    </group>
  );
}

export default function Skull3DScene({ colors, markers, paths, debug, calibrate, simulated, zoom = false, onLoaded, onPick, onCanvas }: {
  zoom?: boolean;
  colors: Float32Array | null; markers: SceneMarker[]; paths: ScenePath[]; debug: boolean; calibrate: boolean; simulated: boolean;
  onLoaded: (s: LoadedSkull) => void; onPick: (p: V3) => void; onCanvas: (c: HTMLCanvasElement) => void;
}) {
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(null);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const loadedCb = useRef(onLoaded); loadedCb.current = onLoaded;

  useEffect(() => {
    let dead = false;
    (async () => {
      const errors: string[] = [];
      for (const url of SKULL_URLS) {
        try {
          setProgress(0);
          const gltf = await new GLTFLoader().loadAsync(url, (e) => !dead && e.total && setProgress(e.loaded / e.total));
          if (dead) return;
          const { geometry, info } = bake(gltf);
          setGeom(geometry); loadedCb.current(info); return;
        } catch (e) { errors.push(`${new URL(url).host}: ${(e as Error).message ?? e}`); }
      }
      if (!dead) setErr(`Could not load the skull model. ${errors.join(" · ")}`);
    })();
    return () => { dead = true; };
  }, []);

  // Update vertex colours in place — no mesh rebuild.
  useEffect(() => {
    if (!geom) return;
    const a = geom.getAttribute("color") as THREE.BufferAttribute;
    if (colors && colors.length === a.array.length) (a.array as Float32Array).set(colors); else (a.array as Float32Array).fill(GREY);
    a.needsUpdate = true;
  }, [geom, colors]);

  if (err) return <div className="grid h-full place-items-center p-4 text-center text-xs text-destructive">{err}</div>;
  if (!geom) return (
    <div className="grid h-full place-items-center"><div className="w-2/3 text-center text-xs text-muted-foreground">Loading skull model… {Math.round(progress * 100)}%
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} /></div></div></div>
  );
  return (
    <div className="relative h-full w-full" data-scene-ready="1">
      <Canvas camera={{ position: [0.5, 0.18, 0.62], fov: 35, near: 0.01, far: 10 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }} onCreated={({ gl }) => onCanvas(gl.domElement)}>
        <color attach="background" args={["#1c1f26"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[1, 2, 2]} intensity={1.6} />
        <directionalLight position={[-2, 0.5, -1]} intensity={0.5} />
        <mesh geometry={geom} onClick={(e: ThreeEvent<MouseEvent>) => { if (calibrate) { e.stopPropagation(); onPick([e.point.x, e.point.y, e.point.z]); } }}>
          <meshStandardMaterial vertexColors roughness={0.7} metalness={0} />
        </mesh>
        {markers.map((m) => {
          const n = new THREE.Vector3(...m.pos).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
          return (
            <group key={m.key} position={m.pos}>
              {m.glow && <mesh quaternion={q} position={n.clone().multiplyScalar(0.002).toArray()}><circleGeometry args={[0.018, 32]} /><meshBasicMaterial color={m.glow} transparent opacity={0.9} toneMapped={false} /></mesh>}
              {m.tx ? <mesh><octahedronGeometry args={[0.011]} /><meshStandardMaterial color={m.color} emissive={m.color} emissiveIntensity={0.5} /></mesh>
                : <mesh><sphereGeometry args={[0.007, 16, 12]} /><meshStandardMaterial color={m.color} emissive={m.color} emissiveIntensity={0.3} /></mesh>}
              <Html position={n.clone().multiplyScalar(0.025).toArray()} center style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap rounded bg-background/85 px-1 text-center font-mono text-[10px] leading-tight"><b>{m.label}</b>{m.sub && <div>{m.sub}</div>}</div>
              </Html>
            </group>
          );
        })}
        {paths.map((p) => p.pts.length >= 6 && (
          <group key={p.key}>
            <Line points={Array.from({ length: p.pts.length / 3 }, (_, i) => new THREE.Vector3(p.pts[i * 3], p.pts[i * 3 + 1], p.pts[i * 3 + 2]).multiplyScalar(1.01))} color="#f5f5f5" lineWidth={1.5} dashed dashSize={0.006} gapSize={0.004} />
            {(() => { const i = Math.floor(p.pts.length / 6) * 3; return <Html position={[p.pts[i] * 1.06, p.pts[i + 1] * 1.06, p.pts[i + 2] * 1.06]} center style={{ pointerEvents: "none" }}><span className="whitespace-nowrap rounded bg-background/85 px-1 font-mono text-[10px]">{p.label}</span></Html>; })()}
          </group>
        ))}
        {debug && <Axes />}
        <OrbitControls target={[0, 0.02, 0]} enablePan={false} enableZoom={zoom} minDistance={0.2} maxDistance={1.5} />
      </Canvas>
      {simulated && <div className="pointer-events-none absolute left-2 top-2 rounded border-2 border-demo bg-demo/20 px-2 py-0.5 text-xs font-black tracking-widest text-demo">SIMULATED</div>}
      {calibrate && <div className="pointer-events-none absolute right-2 top-2 rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Click the skull to place marker</div>}
    </div>
  );
}
