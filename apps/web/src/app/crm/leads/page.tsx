import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { getVendorClients } from "@/lib/crm";
import { getLeadFollowupAgenda, getVendorLeads } from "@/lib/leads";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { LeadsBoard } from "@/app/crm/leads/leads-board";
import {
  convertLeadAction,
  createLeadAction,
  discardLeadAction,
  moveLeadStageAction,
  recordSalesActivityAction,
  recordLeadContactAction,
} from "@/app/crm/leads/actions";
import { LeadFollowupPanel } from "@/app/crm/leads/lead-followup-panel";
import { SalesActivityPanel } from "@/app/crm/leads/sales-activity-panel";
import { getSalesActivityDashboard } from "@/lib/sales-activity";

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const session = await requireStaffSession();
  if (normalizeRole(session.role) !== "vendedor" || !(await sessionCanUseCrm(session))) redirect("/");
  const [leads, clients, leadAgenda] = await Promise.all([
    getVendorLeads(session),
    getVendorClients(session),
    getLeadFollowupAgenda(session),
  ]);
  const dashboard = await getSalesActivityDashboard(session, clients);
  const { active, closed, counts } = leads;
  const params = await searchParams;

  return (
    <ModulePage
      active="crm"
      description="Agenda, actividad y prospectos del vendedor."
      session={session}
      title="CRM · Leads"
    >
      <div className="grid gap-7">
        <SalesActivityPanel dashboard={dashboard} recordAction={recordSalesActivityAction} />
        <LeadFollowupPanel agenda={leadAgenda} recordAction={recordLeadContactAction} />
        <div>
          <h2 className="erp-text-title-md font-black">Prospectos nuevos</h2>
          <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">Embudo de personas o empresas que todavía no son clientes.</p>
          <div className="mt-4">
            <LeadsBoard
              active={active}
              closed={closed}
              convertAction={convertLeadAction}
              counts={counts}
              createAction={createLeadAction}
              initialCreating={params.nuevo === "1"}
              discardAction={discardLeadAction}
              moveAction={moveLeadStageAction}
            />
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
