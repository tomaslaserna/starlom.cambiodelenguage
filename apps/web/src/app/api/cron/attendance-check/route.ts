import { notifyManagerIfEmployeeIsAbsent } from "@/lib/attendance-automation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await notifyManagerIfEmployeeIsAbsent()) });
  } catch (error) {
    console.error("attendance check failed", error);
    return Response.json({ ok: false, error: "No se pudo verificar la asistencia" }, { status: 500 });
  }
}
