import { cacheLife } from "next/cache";
import { errorText, mainnetSnapshot } from "@/lib/data";

async function cached() {
  "use cache";
  cacheLife("minutes");
  return mainnetSnapshot();
}

export async function GET() {
  try {
    return Response.json(await cached());
  } catch (error) {
    return Response.json({ error: errorText(error) }, { status: 502 });
  }
}
