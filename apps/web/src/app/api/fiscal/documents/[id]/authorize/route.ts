import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import {
  authorizeFiscalDocument,
  type FiscalDocumentKind,
  type FiscalDocumentSource,
} from "@/lib/fiscal";
import { positiveId, readRequestBody, textField } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const SOURCES = new Set<FiscalDocumentSource>(["sale", "remittance", "sales_document"]);
const KINDS = new Set<FiscalDocumentKind>(["invoice", "credit_note", "debit_note"]);

function fiscalSource(value: string): FiscalDocumentSource {
  if (SOURCES.has(value as FiscalDocumentSource)) return value as FiscalDocumentSource;
  return "sale";
}

function fiscalKind(value: string): FiscalDocumentKind {
  if (KINDS.has(value as FiscalDocumentKind)) return value as FiscalDocumentKind;
  return "invoice";
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await authorizeFiscalDocument(
      session,
      positiveId(id, "Documento fiscal"),
      fiscalSource(textField(body, "source")),
      fiscalKind(textField(body, "kind")),
    );

    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
