import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { getVendorLeads } from "@/lib/leads";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { LeadsBoard } from "@/app/crm/leads/leads-board";
import {
  convertLeadAction,
  createLeadAction,
  discardLeadAction,
  moveLeadStageAction,
} from "@/app/crm/leads/actions";

export default async function CrmLeadsPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  const { active, closed, counts } = await getVendorLeads(session);

  return (
    <ModulePage
      active="crm"
      description="Prospectos en el embudo, antes de registrarlos como clientes."
      session={session}
      title="CRM · Leads"
    >
      <LeadsBoard
        active={active}
        closed={closed}
        convertAction={convertLeadAction}
        counts={counts}
        createAction={createLeadAction}
        discardAction={discardLeadAction}
        moveAction={moveLeadStageAction}
      />
    </ModulePage>
  );
}
