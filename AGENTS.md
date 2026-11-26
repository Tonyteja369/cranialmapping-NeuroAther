<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- NeuroSense-X runs fully in the browser (no backend): state in `src/lib/nsx/store.ts`, experiments/datasets in IndexedDB, settings in localStorage — keeps the app usable offline and lets a FastAPI backend be added later.
- All signal math lives in `src/lib/nsx/dsp.ts` with tests in `dsp.test.ts` — single, verifiable source for scientific calculations.
- Raw samples are stored in g and never mutated; processing always derives copies — preserves raw data integrity.
- Canonical samples use timestamp (device milliseconds) and sensorId (1–3); parser.ts owns the streaming protocol and CSV/serial validation, with explicit column-unit precedence and configured ID-base normalization — prevents competing interpretations. The downloadable Arduino sketch is imported from src/firmware as raw text so display and download cannot diverge.
- Preview and recordings share validated ingress; live stream selection is explicit, and recording replacement/protocol changes are guarded during acquisition — prevents cross-experiment contamination.
- Save recording metadata and a raw-sample snapshot in one IndexedDB transaction; load legacy t/s fields only at the storage boundary — preserves existing recordings and atomic ownership.
- Charts use ECharts loaded lazily in the browser (`EChart.tsx`) — avoids SSR issues and gives zoom/pan/PNG export.
- PDF reports use jsPDF + jspdf-autotable with flowing text, repeated table headers and post-pass headers/footers (`report.ts`); XLSX/JSON exports are built in `exports.ts` and `xlsx` is lazy-loaded — prevents page overflow and keeps raw/derived layers separate.
- The 3D skull loads the CC0 Khronos ScatteringSkull GLB from CDN URLs at runtime (`Skull3DScene.tsx`, lazy), with attenuation math in `attenuation.ts` (tested) and geodesic Dijkstra in `geodesic.worker.ts`; Measured mode shows only sensors with SNR ≥ 6 dB vs a baseline recording, Model mode only with a fit from n ≥ 3 — keeps measured and modelled layers distinct.
