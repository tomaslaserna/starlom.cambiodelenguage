import { sendAttendanceStartReminder } from "@/lib/attendance-automation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await sendAttendanceStartReminder()) });
  } catch (error) {
    console.error("attendance reminder failed", error);
    return Response.json({ ok: false, error: "No se pudo enviar el recordatorio" }, { status: 500 });
  }
}
