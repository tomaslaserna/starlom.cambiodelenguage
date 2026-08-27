"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import type { SupervisorTask } from "@/lib/supervisor-lab/task-store";

export function SupervisorTaskInbox() {
  const [tasks, setTasks] = useState<SupervisorTask[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const response = await fetch("/api/supervisor-lab/tasks", { cache: "no-store" });
    if (!response.ok) throw new Error("TASKS_LOAD_FAILED");
    const data = (await response.json()) as { tasks?: SupervisorTask[] };
    setTasks(data.tasks ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/supervisor-lab/tasks", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("TASKS_LOAD_FAILED");
        return (await response.json()) as { tasks?: SupervisorTask[] };
      })
      .then((data) => {
        if (active) setTasks(data.tasks ?? []);
      })
      .catch(() => {
        if (active) setError("No se pudieron cargar los recordatorios.");
      });
    return () => {
      active = false;
    };
  }, []);

  function run(action: () => Promise<void>) {
    setError("");
    startTransition(() => {
      void action().catch(() => setError("No se pudo actualizar la bandeja."));
    });
  }

  function generate() {
    run(async () => {
      const response = await fetch("/api/supervisor-lab/tasks", { method: "POST" });
      if (!response.ok) throw new Error("TASKS_GENERATION_FAILED");
      await refresh();
    });
  }

  function update(taskId: string, action: "done" | "dismiss" | "snooze") {
    run(async () => {
      const response = await fetch(`/api/supervisor-lab/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("TASK_UPDATE_FAILED");
      await refresh();
    });
  }

  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-center sm:text-left">
        <div>
          <h2 className="text-lg font-extrabold text-[#0f172a]">Recordatorios operativos</h2>
          <p className="text-sm font-medium text-[#64748b]">Reglas verificables, sin decisiones automáticas de la IA.</p>
        </div>
        <Button disabled={pending} onClick={generate} size="sm" type="button" variant="secondary">
          {pending ? "Actualizando…" : "Actualizar recordatorios"}
        </Button>
      </div>

      {error ? <div className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm font-semibold text-[#b91c1c]">{error}</div> : null}
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm font-medium text-[#64748b]">
          No hay recordatorios activos para vos.
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <div className="grid gap-3 rounded-xl border border-[#d9e2ef] p-4 md:grid-cols-[1fr_auto] md:items-center" key={task.id}>
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-[#0f172a]">{task.title}</strong>
                  <StatusBadge tone={task.priority === "high" || task.priority === "urgent" ? "warning" : "neutral"}>{task.priority}</StatusBadge>
                </div>
                <p className="text-sm font-medium text-[#64748b]">{task.detail}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button disabled={pending} onClick={() => update(task.id, "done")} size="sm" type="button">Completar</Button>
                <Button disabled={pending} onClick={() => update(task.id, "snooze")} size="sm" type="button" variant="secondary">Mañana</Button>
                <Button disabled={pending} onClick={() => update(task.id, "dismiss")} size="sm" type="button" variant="ghost">Descartar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
