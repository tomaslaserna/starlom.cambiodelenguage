import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { CRM_READ_PERMISSION } from "@/lib/route-auth";
import { supervisorAiEnabled } from "@/lib/supervisor-lab/availability";
import { SupervisorChat } from "@/app/supervisor-lab/supervisor-chat";

export default async function SupervisorLabPage() {
  await connection();
  if (!supervisorAiEnabled()) notFound();
  const session = await requireStaffSession();
  await requirePagePermission(session, [CRM_READ_PERMISSION]);
  return (
    <ModulePage
      active="supervisor-lab"
      description=""
      session={session}
      title="LA TIRRA ia.1.1"
    >
      <SupervisorChat />
    </ModulePage>
  );
}
