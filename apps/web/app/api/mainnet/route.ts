import { cacheLife } from "next/cache";
import { mainnetSnapshot } from "@/lib/data";

async function cached() {
  "use cache";
  cacheLife("minutes");
  return mainnetSnapshot();
}

export async function GET() {
  try {
    return Response.json(await cached());
  } catch (error: any) {
    return Response.json({ error: String(error?.message ?? error) }, { status: 502 });
  }
}
