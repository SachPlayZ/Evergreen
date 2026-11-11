import { connection } from "next/server";
import { demoSnapshot } from "@/lib/data";

export async function GET() {
  await connection();
  return Response.json(await demoSnapshot());
}
