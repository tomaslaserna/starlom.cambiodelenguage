import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { getNavigationAuthorization } from "@/lib/navigation";
import { supervisorAiEnabled } from "@/lib/supervisor-lab/availability";
import { SupervisorChat } from "@/app/supervisor-lab/supervisor-chat";
import { SupervisorTaskInbox } from "@/app/supervisor-lab/task-inbox";
import { supervisorTasksEnabled } from "@/lib/supervisor-lab/task-store";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";
import { PersonalizedOverview } from "@/app/supervisor-lab/personalized-overview";

export default async function SupervisorLabPage() {
  await connection();
  if (!supervisorAiEnabled()) notFound();
  const session = await requireStaffSession();
  const [navigationAuthorization, summary] = await Promise.all([
    getNavigationAuthorization(session),
    getSupervisorLandingSummary(session),
  ]);

  return (
    <ModulePage
      active="supervisor-lab"
      description="Asistente interno personalizado con acceso de solo lectura."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="LA TIRRA ia.01"
    >
      <div className="grid gap-5">
        <PersonalizedOverview summary={summary} />
        <SupervisorChat quickPrompts={summary.quickPrompts} />
        {supervisorTasksEnabled() ? <SupervisorTaskInbox /> : null}
      </div>
    </ModulePage>
  );
}
