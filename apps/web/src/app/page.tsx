import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { completeCalendarTaskAction } from "@/app/calendar/actions";
import { requireStaffSession } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { listMessageCenter, listTasks } from "@/lib/messages";

type TaskList = Awaited<ReturnType<typeof listTasks>>;
type PendingTask = TaskList["personal"][number] | TaskList["received"][number];
type AssignedTask = TaskList["assigned"][number];
type MessageCenter = Awaited<ReturnType<typeof listMessageCenter>>;
type MessagePreview = MessageCenter["inbox"][number];

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
        suppressHydrationWarning
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
          <div className="erp-text-body-sm mt-1 whitespace-nowrap font-black text-[#0f172a]">
            {formatDateTime(task.deadline)}
          </div>
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
    <li className="border-t border-[#e5ebf4] px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="erp-text-body-sm break-words font-black text-[#0f172a]">{task.title}</div>
          {task.description ? (
            <p className="erp-text-caption mt-1 whitespace-pre-wrap break-words font-medium text-[#475569]">
              {task.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <StatusBadge tone={priorityTone(task.priority)}>{task.priority}</StatusBadge>
          <StatusBadge tone={statusTone(task.status)}>{task.status}</StatusBadge>
        </div>
      </div>
      <div className="erp-text-caption mt-3 flex flex-wrap gap-x-5 gap-y-1 font-semibold text-[#64748b]">
        <span>{task.assignedTo ? `Delegada a ${task.assignedTo}` : "Sin asignacion"}</span>
        <span>Vence: {formatDateTime(task.deadline)}</span>
        <span>Creada: {formatDateTime(task.createdAt)}</span>
      </div>
      {task.completionMessage ? (
        <div className="erp-text-caption mt-2 rounded-md bg-[#f1f5f9] px-3 py-2 font-medium text-[#475569]">
          Respuesta: {task.completionMessage}
        </div>
      ) : null}
    </li>
  );
}

function UnreadMessageRow({ message }: { message: MessagePreview }) {
  return (
    <li className="border-t border-[#e5ebf4] first:border-t-0">
      <a
        className="grid gap-1 px-4 py-3 transition-colors hover:bg-[#f8fafc]"
        href={`/messages?message=${message.id}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="erp-text-body-sm min-w-0 truncate font-black text-[#0f172a]">
            {message.subject || "(Sin asunto)"}
          </span>
          <span className="erp-text-caption shrink-0 font-semibold text-[#64748b]">{formatDate(message.date)}</span>
        </span>
        <span className="erp-text-caption font-medium text-[#475569]">De {message.from} · Abrir mensaje</span>
      </a>
    </li>
  );
}

export default async function Home() {
  const session = await requireStaffSession();
  const [tasks, center] = await Promise.all([listTasks(session), listMessageCenter(session)]);
  const pendingTasks = [...tasks.personal, ...tasks.received];
  const openAssignedTasks = tasks.assigned.filter((task) => !task.completed);
  const unreadMessages = center.inbox.filter((message) => !message.read).slice(0, 5);

  return (
    <ModulePage
      active="home"
      description="Recordatorios y tareas pendientes."
      session={session}
      title="Inicio"
    >
      <div className="grid gap-5">
        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pendientes para vos</CardTitle>
              <CardDescription>Recordatorios propios y tareas asignadas que todavia no estan cerradas.</CardDescription>
            </CardHeader>
            <CardContent className="grid max-h-[680px] gap-3 overflow-y-auto overscroll-contain">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Tareas delegadas</CardTitle>
                <StatusBadge tone={openAssignedTasks.length ? "info" : "neutral"}>
                  {openAssignedTasks.length} abierta(s)
                </StatusBadge>
              </div>
              <CardDescription>Seguimiento claro de destinatario, vencimiento, prioridad y estado.</CardDescription>
            </CardHeader>
            {openAssignedTasks.length === 0 ? (
              <CardContent>
                <EmptyState title="Sin tareas delegadas abiertas" description="No hay tareas pendientes asignadas por tu usuario." />
              </CardContent>
            ) : (
              <ul className="max-h-[680px] overflow-y-auto overscroll-contain">
                {openAssignedTasks.map((task) => (
                  <AssignedTaskRow key={`delegada-${task.id}`} task={task} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Mensajes sin leer</CardTitle>
              <CardDescription>Mensajes internos que todavia no abriste.</CardDescription>
            </CardHeader>
            {unreadMessages.length === 0 ? (
              <CardContent>
                <EmptyState title="Sin mensajes sin leer" description="No tenes mensajes internos pendientes de leer." />
              </CardContent>
            ) : (
              <>
                <ul className="grid lg:grid-cols-2">
                  {unreadMessages.map((message) => (
                    <UnreadMessageRow key={`mensaje-${message.id}`} message={message} />
                  ))}
                </ul>
                <CardContent>
                  <ButtonLink href="/messages" size="sm" variant="secondary">
                    Ver todos los mensajes
                  </ButtonLink>
                </CardContent>
              </>
            )}
          </Card>
        </section>
      </div>
    </ModulePage>
  );
}
