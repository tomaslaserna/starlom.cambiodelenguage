import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { assertCompanyStoragePath, createSignedStorageUrl } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ bucket: string; path: string[] }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { bucket, path } = await context.params;
    const objectPath = path.join("/");
    assertCompanyStoragePath(objectPath, session.companyId);

    const signedUrl = await createSignedStorageUrl(bucket, objectPath);
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    return handleApiError(error);
  }
}
