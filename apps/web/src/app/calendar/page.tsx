import { ModulePage } from "@/components/module-page";
import { formatDate } from "@/lib/format";
import { listMessageCenter, listTasks } from "@/lib/messages";
import { requireStaffSession } from "@/lib/auth";
import { completeCalendarTaskAction, createCalendarTaskAction } from "@/app/calendar/actions";

export default async function CalendarPage() {
  const session = await requireStaffSession();
  const [tasks, center] = await Promise.all([listTasks(session), listMessageCenter(session)]);
  const pending = [...tasks.personal, ...tasks.received];

  return (
    <ModulePage
      active="calendar"
      description="Recordatorios fijos, tareas asignadas y pendientes operativos."
      session={session}
      title="Calendario"
    >
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <h2 className="font-semibold">Nuevo recordatorio o tarea</h2>
          <form action={createCalendarTaskAction} className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-medium">
              Titulo
              <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="title" required />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Descripcion
              <textarea className="min-h-24 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2" name="description" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Prioridad
                <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Asignar a
                <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="assignedTo">
                  <option value="">Recordatorio propio</option>
                  {center.employees.map((employee) => (
                    <option key={employee} value={employee}>{employee}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Fecha limite
                <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="deadline" type="datetime-local" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Recurrencia
                <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="recurrenceType" defaultValue="unica">
                  <option value="unica">Unica</option>
                  <option value="diaria">Diaria</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Dia del mes
                <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" max="31" min="1" name="recurrenceDayMonth" type="number" />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Dia semana
                <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="recurrenceDayWeek" defaultValue="">
                  <option value="">Sin dia</option>
                  <option value="1">Lunes</option>
                  <option value="2">Martes</option>
                  <option value="3">Miercoles</option>
                  <option value="4">Jueves</option>
                  <option value="5">Viernes</option>
                  <option value="6">Sabado</option>
                  <option value="0">Domingo</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Hora
                <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="recurrenceTime" type="time" />
              </label>
            </div>
            <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
              Guardar
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <h2 className="font-semibold">Pendientes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tarea</th>
                  <th className="px-4 py-3 font-semibold">Prioridad</th>
                  <th className="px-4 py-3 font-semibold">Vence</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay tareas pendientes.
                    </td>
                  </tr>
                ) : (
                  pending.map((task) => (
                    <tr className="border-t border-[color:var(--border)]" key={`${task.title}-${task.id}`}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-[color:var(--muted)]">{task.description}</div>
                      </td>
                      <td className="px-4 py-4">{task.priority}</td>
                      <td className="px-4 py-4">{formatDate(task.deadline)}</td>
                      <td className="px-4 py-4">{task.status}</td>
                      <td className="px-4 py-4">
                        <form action={completeCalendarTaskAction} className="flex gap-2">
                          <input name="id" type="hidden" value={task.id} />
                          <input className="min-h-10 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-2 text-xs" name="message" placeholder="Cierre" />
                          <button className="min-h-10 rounded-md bg-[color:var(--accent)] px-3 text-xs font-semibold text-white hover:bg-[color:var(--accent-strong)]">
                            Completar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ModulePage>
  );
}
