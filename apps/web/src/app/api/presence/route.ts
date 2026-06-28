import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

async function touchPresence(request: NextRequest) {
  const session = await requireApiSession();

  return {
    onlineUsers: [
      {
        userId: session.userId,
        username: session.username,
        displayName: session.displayName,
        lastSeen: new Date().toISOString(),
      },
    ],
    requestPath: request.nextUrl.pathname,
  };
}

export async function GET(request: NextRequest) {
  try {
    const data = await touchPresence(request);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await touchPresence(request);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
