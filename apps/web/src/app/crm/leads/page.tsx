import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { normalizeRole, requireStaffSession } from "@/lib/auth";
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
import { SalesActivityPanel } from "@/app/crm/leads/sales-activity-panel";
import { getSalesActivityDashboard } from "@/lib/sales-activity";

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  const isSeller = normalizeRole(session.role) === "vendedor";
  const [leads, clients, leadAgenda] = await Promise.all([
    getVendorLeads(session),
    isSeller ? getVendorClients(session) : Promise.resolve(null),
    getLeadFollowupAgenda(session),
  ]);
  const dashboard = clients ? await getSalesActivityDashboard(session, clients) : null;
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
        <div>
          <h2 className="erp-text-title-md font-black">Gestión de leads</h2>
          <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">Contactá, reprogramá y convertí prospectos sin perder el próximo paso.</p>
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
              agenda={leadAgenda}
              recordAction={recordLeadContactAction}
            />
          </div>
        </div>
        {dashboard ? <SalesActivityPanel dashboard={dashboard} recordAction={recordSalesActivityAction} /> : null}
      </div>
    </ModulePage>
  );
}
