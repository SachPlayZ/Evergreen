import { connection } from "next/server";
import { testnetSnapshot } from "@/lib/data";

export async function GET() {
  await connection();
  return Response.json(await testnetSnapshot());
}
