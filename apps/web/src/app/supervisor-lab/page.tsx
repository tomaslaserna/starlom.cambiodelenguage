import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { getNavigationAuthorization } from "@/lib/navigation";
import { requirePagePermission } from "@/lib/page-auth";
import { CRM_READ_PERMISSION } from "@/lib/route-auth";
import { supervisorAiEnabled } from "@/lib/supervisor-lab/availability";
import { SupervisorChat } from "@/app/supervisor-lab/supervisor-chat";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";
import { PersonalizedOverview } from "@/app/supervisor-lab/personalized-overview";

export default async function SupervisorLabPage() {
  await connection();
  if (!supervisorAiEnabled()) notFound();
  const session = await requireStaffSession();
  await requirePagePermission(session, [CRM_READ_PERMISSION]);
  const [navigationAuthorization, summary] = await Promise.all([
    getNavigationAuthorization(session),
    getSupervisorLandingSummary(session),
  ]);

  return (
    <ModulePage
      active="supervisor-lab"
      description="Asistente operativo y comercial con conocimiento del ERP y asesoramiento especializado en limpieza."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="LA TIRRA ia.1.1"
    >
      <div className="grid gap-5">
        <PersonalizedOverview summary={summary} />
        <SupervisorChat quickPrompts={summary.quickPrompts} />
      </div>
    </ModulePage>
  );
}
