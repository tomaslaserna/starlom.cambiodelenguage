import { NextResponse } from "next/server";
import { localObligationDb } from "@/lib/cost-obligations-local";
import {
  createCostObligation,
  payCostObligation,
} from "@/lib/cost-obligations-core";
import { readCostPaymentWorkspace } from "@/lib/cost-obligations-read";
export const dynamic = "force-dynamic";
const actor = "11111111-1111-4111-8111-111111111111",
  today = "2026-11-24";
function allowed(r: Request) {
  return (
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(new URL(r.url).hostname)
  );
}
export async function GET(r: Request) {
  if (!allowed(r)) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(
      await readCostPaymentWorkspace(
        await localObligationDb(),
        1,
        new URL(r.url).searchParams.get("month") ?? "2026-11",
        today,
      ),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error local" },
      { status: 409 },
    );
  }
}
export async function POST(r: Request) {
  if (!allowed(r)) return new NextResponse(null, { status: 404 });
  if (r.headers.get("origin") !== new URL(r.url).origin)
    return new NextResponse(null, { status: 403 });
  try {
    const b = await r.json();
    if (!["create", "pay"].includes(b.intent)) throw Error("Acción inválida");
    return NextResponse.json(
      await (
        await localObligationDb()
      ).transaction(async (tx) => {
        if (b.intent === "create")
          return await createCostObligation(tx, 1, actor, b, today);
        return await payCostObligation(tx, 1, actor, b, today);
      }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error local" },
      { status: 409 },
    );
  }
}
