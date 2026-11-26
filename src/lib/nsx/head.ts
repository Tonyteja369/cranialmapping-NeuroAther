export const head = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} · NeuroSense-X` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} · NeuroSense-X` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
