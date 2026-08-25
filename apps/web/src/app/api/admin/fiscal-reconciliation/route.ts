import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/route-auth";
import { cancelIncidentDuplicate, inspectFiscalIncident, linkIncidentInvoice } from "@/lib/fiscal-reconciliation";

export const maxDuration = 60;

function message(error: unknown) { return error instanceof Error ? error.message : "Error de conciliacion fiscal."; }

export async function GET() {
  try { return NextResponse.json(await inspectFiscalIncident(await requireApiSession())); }
  catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    const body = await request.json() as { action?: string; invoiceNumber?: number };
    const invoiceNumber = Number(body.invoiceNumber);
    if (!Number.isInteger(invoiceNumber)) throw new Error("Numero de factura invalido.");
    const result = body.action === "link" ? await linkIncidentInvoice(session, invoiceNumber) : body.action === "cancel" ? await cancelIncidentDuplicate(session, invoiceNumber) : null;
    if (!result) throw new Error("Accion invalida.");
    return NextResponse.json({ ok: true, result });
  } catch (error) { return NextResponse.json({ error: message(error) }, { status: 500 }); }
}
