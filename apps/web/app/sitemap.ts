import type { MetadataRoute } from "next";

const SITE = "https://evergreen-names.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/app`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/agents.md`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
  ];
}
