import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { getMessageAttachment } from "@/lib/message-attachments";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import { createSignedStorageUrl } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ messageId: string; attachmentId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const params = await context.params;
    const messageId = positiveId(params.messageId, "Mensaje");
    const attachmentId = positiveId(params.attachmentId, "Adjunto");
    const attachment = await getMessageAttachment(session, messageId, attachmentId);
    const downloadName = attachment.nombre_original.replace(/[\r\n"]/g, "_").slice(0, 180);
    const signedUrl = await createSignedStorageUrl(
      attachment.bucket,
      attachment.objeto_path,
      5 * 60,
      downloadName,
    );
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    return handleApiError(error);
  }
}
