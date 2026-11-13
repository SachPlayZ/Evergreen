import type { MetadataRoute } from "next";

const SITE = "https://evergreen-names.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
  ];
}
