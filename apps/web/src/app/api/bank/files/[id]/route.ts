import { NextResponse, type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteBankFile, signBankFile } from "@/lib/bank-store";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    const download = new URL(request.url).searchParams.get("download") === "1";
    const signedUrl = await signBankFile(session, id, download);
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    await deleteBankFile(session, id);
    return ok({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
