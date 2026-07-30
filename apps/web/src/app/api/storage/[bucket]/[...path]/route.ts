import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { assertPurchaseReceiptStorageAccess } from "@/lib/purchases";
import { assertCompanyStoragePath, createSignedStorageUrl } from "@/lib/storage";
import { PURCHASES_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ bucket: string; path: string[] }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([PURCHASES_READ_PERMISSION]);
    const { bucket, path } = await context.params;
    const objectPath = path.join("/");
    assertCompanyStoragePath(objectPath, session.companyId);
    await assertPurchaseReceiptStorageAccess(session.companyId, bucket, objectPath);

    const signedUrl = await createSignedStorageUrl(bucket, objectPath);
    const response = NextResponse.redirect(signedUrl, { status: 302 });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
