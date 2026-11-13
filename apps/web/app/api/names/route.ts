import { connection } from "next/server";
import { namesOf } from "@/lib/names";
import { NET } from "@/lib/testnet";

/** For agents: every Name an account holds on testnet (directly or via its Steward), with Lease, Stake and pool position. */
export async function GET(request: Request) {
  await connection();
  const owner = new URL(request.url).searchParams.get("owner")?.trim().toLowerCase();
  if (!owner || !/^[a-z0-9_.-]{2,64}$/.test(owner)) {
    return Response.json({ error: "Pass ?owner=<you.testnet>" }, { status: 400 });
  }
  try {
    const names = await namesOf(owner);
    return Response.json({ network: NET.network, registryId: NET.registryId, namespace: NET.namespace, owner, names });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
