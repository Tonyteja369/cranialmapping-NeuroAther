export const head = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} Â· Neuro Ather` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} Â· Neuro Ather` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
