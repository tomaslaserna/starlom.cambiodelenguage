import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getPublishedPriceLists } from "@/lib/crm";
import { formatVigencia } from "@/lib/crm-quotes";
import { sessionCanUseCrm } from "@/lib/route-auth";

export default async function CrmListasPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const lists = await getPublishedPriceLists(session.companyId);

  return (
    <ModulePage active="crm" description="Listas de precios en vivo para el vendedor." session={session} title="CRM · Listas de precios">
      <div className="grid gap-5">
        <PageHeader title="Listas de precios" description="Siempre la lista actualizada, lista para descargar." />

        {lists.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="erp-text-body text-[color:var(--muted)]">Todavía no hay listas publicadas.</p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
            <ul className="divide-y divide-[color:var(--border)]">
              {lists.map((list) => (
                <li key={list.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div>
                    <div className="erp-text-body font-semibold text-[color:var(--foreground)]">{list.name}</div>
                    <div className="erp-text-caption text-[color:var(--muted)]">{formatVigencia(list.validFrom, list.validTo)}</div>
                  </div>
                  <a
                    href={`/api/pdfs/pricing/price-list?list=${list.id}&iva=21&groupBy=categoria&stock=todos&download=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="erp-text-body-sm rounded-[9px] border border-[color:var(--accent)] bg-[color:var(--accent)] px-3 py-2 font-semibold text-white transition-colors hover:bg-[color:var(--accent-strong)]"
                  >
                    Descargar PDF
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModulePage>
  );
}
