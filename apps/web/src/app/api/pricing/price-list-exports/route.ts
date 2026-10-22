import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { recordPriceListShare } from "@/lib/price-list-followups";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

function value(form: FormData, key: string) {
  const entry = form.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([
      { resource: "productos", action: "ver" },
      { resource: "crm", action: "ver" },
    ]);
    const form = await request.formData();
    const listId = Number(value(form, "list"));
    const recipientType = value(form, "recipientType") === "cliente" ? "cliente" : "prospecto";
    await recordPriceListShare(session, {
      listId,
      recipientType,
      customerId: value(form, "customerId") || undefined,
      prospectName: value(form, "prospectName") || undefined,
      prospectPhone: value(form, "prospectPhone") || undefined,
      purpose: value(form, "purpose"),
      followUpDays: Number(value(form, "followUpDays") || 7),
    });

    const pdfUrl = new URL("/api/pdfs/pricing/price-list", request.url);
    for (const key of ["list", "vigencia", "stock", "groupBy", "filter"]) {
      const field = value(form, key);
      if (field) pdfUrl.searchParams.set(key, field);
    }
    pdfUrl.searchParams.set("download", "1");
    return NextResponse.redirect(pdfUrl, 303);
  } catch (error) {
    return handleApiError(error);
  }
}
