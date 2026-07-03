# Escritorio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Escritorio" to the Inicio menu (linking to the existing `/` home page) and extend that page with a compact preview of unread internal messages, alongside the pending/delegated tasks it already shows.

**Architecture:** Two independent, sequential changes to an existing Next.js server component setup. Task 1 only touches the navigation data (`src/lib/navigation.ts`). Task 2 only touches the home page (`src/app/page.tsx`), reusing the existing `listMessageCenter` data loader — no new backend/query code. Both are verified with the project's existing static regression suite (`apps/web/scripts/static.test.mjs`), which pattern-matches source files; this repo has no component-level test runner.

**Tech Stack:** Next.js 16 (App Router, React 19 server components), TypeScript, Tailwind utility classes, Node's built-in `node:test` for the static regression suite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-escritorio-dashboard-design.md` — follow it exactly; this plan implements it.
- No new permission gate for "Escritorio" — accessible to any staff session, same as `Calendario` (per spec §"Sin cambios").
- No badge on the new "Escritorio" nav entry — the `Inicio` section already sums badges from `Calendario` (`tasks`) and `Mensajes` (`messages`); adding one here would double-count (per spec §1).
- Reuse `listMessageCenter` as-is — no new query, no new DB access (per spec §"Contexto técnico").
- Messages preview shows sender + subject + date only, no body, capped at 5 (per spec §"Alcance").
- After each task's code change, run the **full** `static.test.mjs` suite (not just the new assertions) — it pattern-matches across the whole source tree and unrelated changes can trip existing assertions.

---

### Task 1: Add "Escritorio" to the Inicio menu

**Files:**
- Modify: `apps/web/src/lib/navigation.ts` (add a new group + update the `Inicio` section, currently around lines 61 and 249-252)
- Test: `apps/web/scripts/static.test.mjs` (new `test(...)` block, appended at end of file)

**Interfaces:**
- Consumes: existing `NavigationGroup` type (`href`, `label`, `active` fields — no `items`, no `badge`, no `permission`) and existing `groupByLabel(label: string)` helper, both already defined in `navigation.ts`.
- Produces: a `NavigationGroup` with `label: "Escritorio"` findable via `groupByLabel("Escritorio")`, and the `Inicio` section's `groups` array starting with it. Task 2 does not depend on this — it edits a different file.

- [ ] **Step 1: Write the failing test**

Open `apps/web/scripts/static.test.mjs` and append this new test at the very end of the file (after the last `});` on line 365):

```js

test("Escritorio is listed first in the Inicio menu and links to the home page", () => {
  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/",\s*label: "Escritorio",\s*active: "home",/);
  assert.match(
    navigation,
    /label: "Inicio"[\s\S]*groups: \[groupByLabel\("Escritorio"\), groupByLabel\("Calendario"\), groupByLabel\("Mensajes"\)\]/,
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && node --test scripts/static.test.mjs`
Expected: the new test `Escritorio is listed first in the Inicio menu and links to the home page` FAILs (both `assert.match` calls throw, since `navigation.ts` doesn't have this text yet). The other 12 existing tests still PASS.

- [ ] **Step 3: Add the "Escritorio" group to `navigationGroups`**

In `apps/web/src/lib/navigation.ts`, find the start of the `navigationGroups` array (`export const navigationGroups: NavigationGroup[] = [`) and insert this as the very first entry, before the existing `Balance` group:

```ts
  {
    href: "/",
    label: "Escritorio",
    active: "home",
  },
```

- [ ] **Step 4: Add "Escritorio" to the `Inicio` section**

In the same file, find the `Inicio` section inside `navigationSections`:

```ts
  {
    label: "Inicio",
    groups: [groupByLabel("Calendario"), groupByLabel("Mensajes")],
  },
```

Replace it with:

```ts
  {
    label: "Inicio",
    groups: [groupByLabel("Escritorio"), groupByLabel("Calendario"), groupByLabel("Mensajes")],
  },
```

- [ ] **Step 5: Run the full static test suite to verify it passes**

Run: `cd apps/web && node --test scripts/static.test.mjs`
Expected: `tests 13`, `pass 13`, `fail 0` (the new test now passes, and all 12 pre-existing tests still pass).

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: only the two pre-existing unrelated errors in `src/app/pricing/offers/actions.ts` and `src/app/rentabilidad/actions.ts` (both about `Record<string, unknown>` vs `Record<string, string>`). No new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/navigation.ts apps/web/scripts/static.test.mjs
git commit -m "feat: add Escritorio to Inicio menu"
```

---

### Task 2: Add unread messages preview to the Escritorio page

**Files:**
- Modify: `apps/web/src/app/page.tsx` (full file shown below)
- Test: `apps/web/scripts/static.test.mjs` (new `test(...)` block, appended after Task 1's)

**Interfaces:**
- Consumes: `listMessageCenter(session: AuthSession)` from `@/lib/messages`, already defined and exported (returns `{ inbox: Array<{ id: number; from: string; subject: string; date: string; read: boolean; ... }>, ... }` — see `apps/web/src/lib/messages.ts:157-184`). Also consumes `ButtonLink` from `@/components/ui` (`apps/web/src/components/ui/button-link.tsx`, props include `href`, `size`, `variant`).
- Produces: nothing consumed by another task — this is the last task in the plan.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/scripts/static.test.mjs`, after the test added in Task 1:

```js

test("Escritorio previews up to 5 unread messages alongside pending tasks", () => {
  const home = read("apps/web/src/app/page.tsx");
  assert.match(home, /listMessageCenter/);
  assert.match(home, /unreadMessages/);
  assert.match(home, /\.filter\(\(message\) => !message\.read\)/);
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /Mensajes sin leer/);
  assert.match(home, /href="\/messages"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && node --test scripts/static.test.mjs`
Expected: `Escritorio previews up to 5 unread messages alongside pending tasks` FAILs (none of these strings exist in `page.tsx` yet). The 13 tests from before (12 original + Task 1's) still PASS.

- [ ] **Step 3: Replace `apps/web/src/app/page.tsx` with the version below**

```tsx
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
  PageHeader,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { completeCalendarTaskAction } from "@/app/calendar/actions";
import { requireStaffSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
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

function UnreadMessageRow({ message }: { message: MessagePreview }) {
  return (
    <li className="grid gap-1 border-t border-[#e5ebf4] px-4 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="erp-text-body-sm min-w-0 truncate font-black text-[#0f172a]">
          {message.subject || "(Sin asunto)"}
        </span>
        <span className="erp-text-caption shrink-0 font-semibold text-[#64748b]">{formatDate(message.date)}</span>
      </div>
      <span className="erp-text-caption font-medium text-[#475569]">De {message.from}</span>
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
        <PageHeader
          description="Pendientes operativos visibles al iniciar sesion."
          eyebrow="Inicio"
          title="Recordatorios y tareas"
        />

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.85fr_0.85fr]">
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

          <Card>
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
                <ul>
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
```

- [ ] **Step 4: Run the full static test suite to verify it passes**

Run: `cd apps/web && node --test scripts/static.test.mjs`
Expected: `tests 14`, `pass 14`, `fail 0`.

- [ ] **Step 5: Type-check**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: only the same two pre-existing unrelated errors as in Task 1 (`pricing/offers/actions.ts`, `rentabilidad/actions.ts`). No new errors — in particular, no errors about `MessagePreview`, `ButtonLink`, or `listMessageCenter` (this confirms the types line up: `MessageCenter["inbox"][number]` matches what `UnreadMessageRow` expects, and `ButtonLink`'s `href` prop accepts a plain string route).

- [ ] **Step 6: Lint**

Run: `cd apps/web && npx eslint src/app/page.tsx`
Expected: no output (no errors, no unused imports — `Button` is still used by `TaskCompletionForm`, `ButtonLink` is newly used by the messages card).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/scripts/static.test.mjs
git commit -m "feat: preview unread messages on the Escritorio dashboard"
```

---

## Manual verification (not automatable in this environment)

This repo has no `.env` configured in the current working copy, and the Escritorio page requires an authenticated Supabase-backed session (`requireStaffSession`) plus real `mensajes`/`recordatorios`/`tareas_asignadas` rows to render meaningfully. Neither task above can be verified by rendering the page in this environment. Once deployed/run with real credentials, confirm by hand:

1. Sidebar → **Inicio** section shows **Escritorio** as the first item, above Calendario and Mensajes.
2. Visiting `/` shows three columns on a wide screen: Pendientes para vos, Tareas delegadas, Mensajes sin leer.
3. With unread messages in the inbox: up to 5 show, newest first (`listMessageCenter`'s `inbox` is already ordered by `fecha DESC`), each with sender, subject, and date.
4. Clicking "Ver todos los mensajes" goes to `/messages`.
5. After marking all inbox messages read (via `/messages`'s "Marcar recibidos como leidos" button) and reloading `/`: the third column shows the "Sin mensajes sin leer" empty state.
6. On a narrow (mobile) screen, the three cards stack vertically (the `xl:` prefix on the grid columns means it only splits into 3 columns at the `xl` breakpoint).
