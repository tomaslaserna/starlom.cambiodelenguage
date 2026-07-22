import { ModulePage } from "@/components/module-page";
import { formatDateTime } from "@/lib/format";
import { listMessageCenter, listTasks } from "@/lib/messages";
import { requireStaffSession } from "@/lib/auth";
import { completeCalendarTaskAction, createCalendarTaskAction } from "@/app/calendar/actions";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

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
        <Card>
          <CardHeader>
            <CardTitle>Nuevo recordatorio o tarea</CardTitle>
          </CardHeader>
          <CardContent>
          <form action={createCalendarTaskAction} className="grid gap-3">
            <Field htmlFor="calendar-title" label="Titulo" required>
              <Input id="calendar-title" name="title" required />
            </Field>
            <Field htmlFor="calendar-description" label="Descripcion">
              <Textarea id="calendar-description" className="min-h-24" name="description" />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field htmlFor="calendar-priority" label="Prioridad">
                <Select id="calendar-priority" name="priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </Select>
              </Field>
              <Field htmlFor="calendar-assigned-to" label="Asignar a">
                <Select id="calendar-assigned-to" name="assignedTo">
                  <option value="">Recordatorio propio</option>
                  {center.employees.map((employee) => (
                    <option key={employee} value={employee}>{employee}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field htmlFor="calendar-deadline" label="Fecha limite">
                <Input id="calendar-deadline" name="deadline" type="datetime-local" />
              </Field>
              <Field htmlFor="calendar-recurrence" label="Recurrencia">
                <Select id="calendar-recurrence" name="recurrenceType" defaultValue="unica">
                  <option value="unica">Unica</option>
                  <option value="diaria">Diaria</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field htmlFor="calendar-month-day" label="Dia del mes">
                <Input id="calendar-month-day" max="31" min="1" name="recurrenceDayMonth" type="number" />
              </Field>
              <Field htmlFor="calendar-week-day" label="Dia semana">
                <Select id="calendar-week-day" name="recurrenceDayWeek" defaultValue="">
                  <option value="">Sin dia</option>
                  <option value="1">Lunes</option>
                  <option value="2">Martes</option>
                  <option value="3">Miercoles</option>
                  <option value="4">Jueves</option>
                  <option value="5">Viernes</option>
                  <option value="6">Sabado</option>
                  <option value="0">Domingo</option>
                </Select>
              </Field>
              <Field htmlFor="calendar-time" label="Hora">
                <Input id="calendar-time" name="recurrenceTime" type="time" />
              </Field>
            </div>
            <Button type="submit">
              Guardar
            </Button>
          </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <DataTable
            caption="Tareas y recordatorios pendientes"
            className="rounded-none border-0 shadow-none"
            minWidth="720px"
            tableLabel="Pendientes"
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Tarea</DataTableHead>
                  <DataTableHead>Prioridad</DataTableHead>
                  <DataTableHead>Vence</DataTableHead>
                  <DataTableHead>Estado</DataTableHead>
                  <DataTableHead>Accion</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {pending.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay tareas pendientes.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  pending.map((task) => (
                    <DataTableRow key={`${task.title}-${task.id}`}>
                      <DataTableCell>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-xs text-[color:var(--muted)]">{task.description}</div>
                      </DataTableCell>
                      <DataTableCell>{task.priority}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDateTime(task.deadline)}</DataTableCell>
                      <DataTableCell>{task.status}</DataTableCell>
                      <DataTableCell>
                        <form action={completeCalendarTaskAction} className="flex gap-2">
                          <input name="id" suppressHydrationWarning type="hidden" value={task.id} />
                          <Input className="min-h-9 min-w-32 px-2 text-xs" name="message" placeholder="Nota de cierre" />
                          <Button size="sm" type="submit">
                            Completar
                          </Button>
                        </form>
                      </DataTableCell>
                    </DataTableRow>
                  ))
                )}
              </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
