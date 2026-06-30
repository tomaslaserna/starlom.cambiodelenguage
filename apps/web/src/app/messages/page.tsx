import { ModulePage } from "@/components/module-page";
import { formatDate } from "@/lib/format";
import { listMessageCenter } from "@/lib/messages";
import { requireStaffSession } from "@/lib/auth";
import { markInboxReadAction, saveDraftAction, sendMessageAction } from "@/app/messages/actions";

type MessagesPageProps = {
  searchParams: Promise<{
    box?: string;
  }>;
};

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const box = params.box === "sent" || params.box === "drafts" ? params.box : "inbox";
  const center = await listMessageCenter(session);
  const messages = box === "sent" ? center.sent : box === "drafts" ? center.drafts : center.inbox;

  return (
    <ModulePage
      active="messages"
      description="Mensajeria interna entre usuarios registrados, con bandejas y clasificacion por importancia."
      session={session}
      title="Mensajes"
    >
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="grid gap-4">

          {box === "inbox" ? (
            <form action={markInboxReadAction}>
              <button className="min-h-10 rounded-md border border-[color:var(--border)] px-3 text-sm font-semibold hover:bg-[color:var(--panel-subtle)]">
                Marcar recibidos como leidos
              </button>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">{box === "sent" ? "Para" : "De"}</th>
                  <th className="px-4 py-3 font-semibold">Asunto</th>
                  <th className="px-4 py-3 font-semibold">Importancia</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                      No hay mensajes en esta bandeja.
                    </td>
                  </tr>
                ) : (
                  messages.map((message) => (
                    <tr className="border-t border-[color:var(--border)]" key={message.id}>
                      <td className="px-4 py-4">{box === "sent" ? message.to || "-" : message.from}</td>
                      <td className="px-4 py-4">
                        <div className={message.read ? "font-medium" : "font-semibold"}>{message.subject}</div>
                        <div className="text-xs text-[color:var(--muted)]">{message.bodyPreview}</div>
                      </td>
                      <td className="px-4 py-4">{message.importance}</td>
                      <td className="px-4 py-4">{formatDate(message.date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <h2 className="font-semibold">Nuevo mensaje</h2>
          <form className="mt-4 grid gap-3" action={sendMessageAction}>
            <label className="grid gap-2 text-sm font-medium">
              Para
              <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="to" required>
                <option value="">Seleccionar usuario</option>
                {center.employees.map((employee) => (
                  <option key={employee} value={employee}>
                    {employee}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Importancia
              <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="importance" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
                <option value="baja">Baja</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Asunto
              <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="subject" required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Mensaje
              <textarea className="min-h-36 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2" name="body" required />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
                Enviar
              </button>
              <button
                className="min-h-11 rounded-md border border-[color:var(--border)] px-4 text-sm font-semibold hover:bg-[color:var(--panel-subtle)]"
                formAction={saveDraftAction}
              >
                Guardar borrador
              </button>
            </div>
          </form>
        </section>
      </div>
    </ModulePage>
  );
}
