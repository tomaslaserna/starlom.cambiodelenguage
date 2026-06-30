import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { completeCalendarTaskAction } from "@/app/calendar/actions";
import { requireStaffSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listTasks } from "@/lib/messages";

type TaskList = Awaited<ReturnType<typeof listTasks>>;
type PendingTask = TaskList["personal"][number] | TaskList["received"][number];
type AssignedTask = TaskList["assigned"][number];

function statusTone(status: string): StatusBadgeTone {
  const normalized = status.toLowerCase();
  if (normalized.includes("venc")) return "danger";
  if (normalized.includes("urgent")) return "danger";
  if (normalized.includes("alta")) return "warning";
  if (normalized.includes("complet")) return "success";
  return "neutral";
}

function priorityTone(priority: string): StatusBadgeTone {
  const normalized = priority.toLowerCase();
  if (normalized === "urgente") return "danger";
  if (normalized === "alta") return "warning";
  return "neutral";
}

function TaskCompletionForm({ id }: { id: number }) {
  return (
    <form action={completeCalendarTaskAction} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input name="id" type="hidden" value={id} />
      <input
        className="min-h-10 min-w-0 rounded-[8px] border border-[#d9e2ef] bg-white px-3 text-sm font-medium text-[#0f172a] shadow-[var(--shadow-xs)] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#2563eb]"
        name="message"
        placeholder="Nota de cierre"
      />
      <Button size="sm" type="submit">
        Completar
      </Button>
    </form>
  );
}

function PendingTaskCard({ task, type }: { task: PendingTask; type: "recordatorio" | "tarea" }) {
  const assignedBy = "assignedBy" in task ? task.assignedBy : "";

  return (
    <article className="rounded-[10px] border border-[#d9e2ef] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={type === "tarea" ? "accent" : "info"}>{type === "tarea" ? "Tarea" : "Recordatorio"}</StatusBadge>
            <StatusBadge tone={priorityTone(task.priority)}>{task.priority}</StatusBadge>
            <StatusBadge tone={statusTone(task.status)}>{task.status}</StatusBadge>
          </div>
          <h2 className="erp-text-title-sm mt-3 font-black text-[#0f172a]">{task.title}</h2>
          {task.description ? (
            <p className="erp-text-body-sm mt-1 font-medium text-[#475569]">{task.description}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="erp-text-caption font-black uppercase text-[#64748b]">Vence</div>
          <div className="erp-text-body-sm mt-1 font-black text-[#0f172a]">{formatDate(task.deadline)}</div>
        </div>
      </div>

      {assignedBy ? (
        <p className="erp-text-caption mt-3 font-semibold text-[#64748b]">Asignada por {assignedBy}</p>
      ) : null}

      <TaskCompletionForm id={task.id} />
    </article>
  );
}

function AssignedTaskRow({ task }: { task: AssignedTask }) {
  return (
    <li className="grid gap-3 border-t border-[#e5ebf4] px-4 py-4 md:grid-cols-[minmax(0,1fr)_150px_120px] md:items-center">
      <div className="min-w-0">
        <div className="erp-text-body-sm font-black text-[#0f172a]">{task.title}</div>
        <div className="erp-text-caption mt-1 font-semibold text-[#64748b]">
          {task.assignedTo ? `Para ${task.assignedTo}` : "Sin asignacion"} - {formatDate(task.deadline)}
        </div>
        {task.completionMessage ? (
          <div className="erp-text-caption mt-1 font-medium text-[#475569]">{task.completionMessage}</div>
        ) : null}
      </div>
      <StatusBadge className="w-fit" tone={priorityTone(task.priority)}>
        {task.priority}
      </StatusBadge>
      <StatusBadge className="w-fit" tone={statusTone(task.status)}>
        {task.status}
      </StatusBadge>
    </li>
  );
}

export default async function Home() {
  const session = await requireStaffSession();
  const tasks = await listTasks(session);
  const pendingTasks = [...tasks.personal, ...tasks.received];
  const openAssignedTasks = tasks.assigned.filter((task) => !task.completed);

  return (
    <ModulePage
      active="home"
      description="Recordatorios y tareas pendientes."
      session={session}
      title="Inicio"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Pendientes operativos visibles al iniciar sesion."
          eyebrow="Inicio"
          title="Recordatorios y tareas"
        />

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Pendientes para vos</CardTitle>
              <CardDescription>Recordatorios propios y tareas asignadas que todavia no estan cerradas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {pendingTasks.length === 0 ? (
                <EmptyState title="Sin pendientes" description="No hay recordatorios ni tareas abiertas para tu usuario." />
              ) : (
                pendingTasks.map((task) => (
                  <PendingTaskCard
                    key={`${"assignedBy" in task ? "tarea" : "recordatorio"}-${task.id}`}
                    task={task}
                    type={"assignedBy" in task ? "tarea" : "recordatorio"}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tareas delegadas</CardTitle>
              <CardDescription>Seguimiento de tareas abiertas que asignaste a otros usuarios.</CardDescription>
            </CardHeader>
            {openAssignedTasks.length === 0 ? (
              <CardContent>
                <EmptyState title="Sin tareas delegadas abiertas" description="No hay tareas pendientes asignadas por tu usuario." />
              </CardContent>
            ) : (
              <ul>
                {openAssignedTasks.map((task) => (
                  <AssignedTaskRow key={`delegada-${task.id}`} task={task} />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </ModulePage>
  );
}
