import type { MetadataRoute } from "next";
import { APP_URL, DOCS_URL, SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${APP_URL}/`, changeFrequency: "daily", priority: 0.9 },
    { url: `${DOCS_URL}/`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/agents.md`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
  ];
}
