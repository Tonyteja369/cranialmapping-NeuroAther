import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { DampingView, FrequencyResponseView, MechanicalSymmetryView, PARAMS, ResonanceFrequencyView, ResonanceProfileView, VibrationAmplitudeView, type ParamId } from "@/components/nsx/params";
import { Page } from "@/components/nsx/ui";

const VIEWS: Record<ParamId, () => React.ReactElement> = {
  "resonance-frequency": ResonanceFrequencyView,
  "vibration-amplitude": VibrationAmplitudeView,
  "frequency-response": FrequencyResponseView,
  "mechanical-symmetry": MechanicalSymmetryView,
  "damping-behaviour": DampingView,
  "resonance-profile": ResonanceProfileView,
};

export const Route = createFileRoute("/parameters/$param")({
  loader: ({ params }) => {
    const p = PARAMS.find((x) => x.id === params.param);
    if (!p) throw notFound();
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Parameter"} · NeuroSense-X` },
      { name: "description", content: `Detailed ${loaderData?.title ?? ""} analysis from measured three-sensor data.` },
      { property: "og:title", content: `${loaderData?.title ?? "Parameter"} · NeuroSense-X` },
      { property: "og:description", content: "Measured parameter analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParamPage,
});

function ParamPage() {
  const p = Route.useLoaderData();
  const View = VIEWS[p.id];
  return (
    <Page title={`${p.n}. ${p.title}`} subtitle="Measured Parameters · detailed analysis" actions={
      <div className="flex flex-wrap gap-1">{PARAMS.map((x) => <Link key={x.id} to="/parameters/$param" params={{ param: x.id }} className={`btn h-7 text-xs ${x.id === p.id ? "btn-primary" : ""}`}>{x.n}</Link>)}</div>
    }>
      <View />
    </Page>
  );
}
