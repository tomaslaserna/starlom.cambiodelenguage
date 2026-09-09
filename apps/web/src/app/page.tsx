import Image from "next/image";
import { ModulePage } from "@/components/module-page";
import {
  AppIcon,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import type { AppIconName } from "@/components/ui/app-icon";
import { completeCalendarTaskAction } from "@/app/calendar/actions";
import { InicioTabs } from "@/app/inicio-tabs";
import { PizarronBoard } from "@/app/pizarron-board";
import { boardCoworkers, listBoardNotes } from "@/lib/board";
import { requireStaffSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listTasks } from "@/lib/messages";
import {
  ORDERS_CREATE_PERMISSION,
  PRODUCTS_READ_PERMISSION,
  QUOTES_READ_PERMISSION,
  sessionAllows,
  sessionCanReadCollections,
} from "@/lib/route-auth";

type Shortcut = { href: string; label: string; icon: AppIconName };

type TaskList = Awaited<ReturnType<typeof listTasks>>;
type PendingTask = TaskList["personal"][number] | TaskList["received"][number];
type AssignedTask = TaskList["assigned"][number];

const customWork = [
  { title: "Dispensadores de jabón", description: "Personalizados para acompañar la identidad de cada negocio.", image: "/custom-services/dispensador-jabon-personalizado.png" },
  { title: "Toalla en rollo", description: "Equipamiento resistente para espacios de uso intensivo.", image: "/custom-services/dispensador-toalla-rollo-personalizado.png" },
  { title: "Papel higiénico", description: "Portarrollos institucionales preparados para grandes consumos.", image: "/custom-services/dispensador-papel-higienico-personalizado.png" },
];

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

// Vencidos primero, luego urgente, alta y el resto.
function urgencyRank(task: PendingTask): number {
  if (task.status.toLowerCase().includes("venc")) return 0;
  const priority = task.priority.toLowerCase();
  if (priority === "urgente") return 1;
  if (priority === "alta") return 2;
  return 3;
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

      <details className="group/complete mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-bold text-[#2563eb] hover:underline">
          <span className="transition-transform group-open/complete:rotate-90">›</span> Completar
        </summary>
        <TaskCompletionForm id={task.id} />
      </details>
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

export default async function Home() {
  const session = await requireStaffSession();
  const [tasks, boardNotes, coworkers] = await Promise.all([
    listTasks(session),
    listBoardNotes(session),
    boardCoworkers(session),
  ]);
  const pendingTasks = [...tasks.personal, ...tasks.received].sort((a, b) => urgencyRank(a) - urgencyRank(b));
  const openAssignedTasks = tasks.assigned.filter((task) => !task.completed);
  const overdueCount = pendingTasks.filter((task) => task.status.toLowerCase().includes("venc")).length;

  const [canCreateOrders, canReadQuotes, canReadProducts, canReadCollections] = await Promise.all([
    sessionAllows(session, [ORDERS_CREATE_PERMISSION]),
    sessionAllows(session, [QUOTES_READ_PERMISSION]),
    sessionAllows(session, [PRODUCTS_READ_PERMISSION]),
    sessionCanReadCollections(session),
  ]);
  const shortcuts: Shortcut[] = [
    canCreateOrders ? { href: "/orders/new", label: "Cargar pedido", icon: "cart" } : null,
    canReadQuotes ? { href: "/quotes", label: "Presupuestos", icon: "quote" } : null,
    canReadProducts ? { href: "/prices", label: "Lista de precios", icon: "package" } : null,
    canReadCollections ? { href: "/payments/accounts", label: "Cobranzas", icon: "wallet" } : null,
    { href: "/calendar", label: "Calendario", icon: "calendar" },
  ].filter((item): item is Shortcut => item !== null);

  return (
    <ModulePage
      active="home"
      description="Recordatorios y tareas pendientes."
      session={session}
      title="Inicio"
    >
      <div className="grid gap-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<AppIcon className="h-5 w-5" name="warning" />} label="Vencidos" tone="danger" value={overdueCount} />
          <StatCard icon={<AppIcon className="h-5 w-5" name="clock" />} label="Pendientes para vos" tone="accent" value={pendingTasks.length} />
          <StatCard icon={<AppIcon className="h-5 w-5" name="units" />} label="Delegadas abiertas" tone="info" value={openAssignedTasks.length} />
          <StatCard icon={<AppIcon className="h-5 w-5" name="receipt" />} label="Notas en pizarrón" tone="warning" value={boardNotes.length} />
        </section>

        <section className="seller-mobile-optional-shortcuts">
          <h2 className="erp-text-caption font-bold uppercase tracking-wide text-[#64748b]">Accesos rápidos</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {shortcuts.map((shortcut) => (
              <ButtonLink
                href={shortcut.href}
                key={shortcut.href}
                leadingIcon={<AppIcon className="h-4 w-4" name={shortcut.icon} />}
                variant="secondary"
              >
                {shortcut.label}
              </ButtonLink>
            ))}
          </div>
        </section>

        <section aria-labelledby="custom-work-title" className="overflow-hidden rounded-[18px] border border-[#d7e3ef] bg-white shadow-[0_12px_34px_rgba(26,55,96,0.09)]">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative min-h-[260px] overflow-hidden bg-[#e8edf1] sm:min-h-[340px]">
              <Image alt="Línea de dispensadores personalizados Starlim" className="object-cover" fill sizes="(max-width: 1023px) 100vw, 55vw" src="/custom-services/dispensadores-personalizados-starlim.png" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#081a30]/30 via-transparent to-transparent" />
            </div>
            <div className="flex flex-col justify-center p-5 sm:p-8">
              <span className="erp-text-caption font-black uppercase tracking-[0.14em] text-[#2563eb]">También realizamos</span>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[#0f172a] sm:text-3xl" id="custom-work-title">Soluciones personalizadas para cada espacio</h2>
              <p className="mt-3 max-w-xl font-medium leading-7 text-[#64748b]">Desarrollamos equipamiento institucional personalizado. Este apartado crecerá con nuevos trabajos y productos especiales.</p>
              <a className="mt-6 inline-flex w-fit items-center rounded-[10px] bg-[#2563eb] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#1d4ed8]" href="https://wa.me/543543683594?text=Hola%2C%20quiero%20consultar%20por%20un%20trabajo%20personalizado" rel="noreferrer" target="_blank">Consultar un proyecto →</a>
            </div>
          </div>
          <div className="grid gap-3 border-t border-[#e2e8f0] bg-[#f8fafc] p-4 sm:grid-cols-3 sm:p-5">
            {customWork.map((item) => (
              <article className="flex items-center gap-3 rounded-[12px] border border-[#dbe5f1] bg-white p-3 shadow-[var(--shadow-xs)]" key={item.title}>
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[9px] bg-[#eef2f5]"><Image alt={item.title} className="object-cover" fill sizes="96px" src={item.image} /></div>
                <div className="min-w-0"><h3 className="font-black text-[#0f172a]">{item.title}</h3><p className="mt-1 text-xs font-medium leading-5 text-[#64748b]">{item.description}</p></div>
              </article>
            ))}
          </div>
        </section>

        <InicioTabs
          tabs={[
            {
              key: "vos",
              label: "Para vos",
              count: pendingTasks.length,
              content:
                pendingTasks.length === 0 ? (
                  <EmptyState title="Sin pendientes" description="No hay recordatorios ni tareas abiertas para tu usuario." />
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {pendingTasks.map((task) => (
                      <PendingTaskCard
                        key={`${"assignedBy" in task ? "tarea" : "recordatorio"}-${task.id}`}
                        task={task}
                        type={"assignedBy" in task ? "tarea" : "recordatorio"}
                      />
                    ))}
                  </div>
                ),
            },
            {
              key: "delegadas",
              label: "Delegadas",
              count: openAssignedTasks.length,
              content:
                openAssignedTasks.length === 0 ? (
                  <EmptyState title="Sin tareas delegadas abiertas" description="No hay tareas pendientes asignadas por tu usuario." />
                ) : (
                  <Card className="overflow-hidden">
                    <ul>
                      {openAssignedTasks.map((task) => (
                        <AssignedTaskRow key={`delegada-${task.id}`} task={task} />
                      ))}
                    </ul>
                  </Card>
                ),
            },
            {
              key: "pizarron",
              label: "Pizarrón",
              count: boardNotes.length,
              content: <PizarronBoard coworkers={coworkers} initialNotes={boardNotes} />,
            },
          ]}
        />
      </div>
    </ModulePage>
  );
}
