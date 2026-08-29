import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { listVendors } from "@/lib/imports";
import { getOrderFormData } from "@/lib/orders";
import { QUOTES_CREATE_PERMISSION, sessionAllows, sessionCanUseCrm } from "@/lib/route-auth";
import { createQuoteAction } from "@/app/quotes/actions";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";
import { QuoteEntryForm } from "@/app/quotes/quote-entry-form";

export default async function NewCrmQuotePage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  if (!(await sessionAllows(session, [QUOTES_CREATE_PERMISSION]))) redirect("/crm/presupuestos");

  const [quoteFormData, vendors] = await Promise.all([
    getOrderFormData(session.companyId),
    listVendors(session.companyId),
  ]);

  return (
    <ModulePage active="crm" description="Carga de un nuevo presupuesto desde CRM." session={session} title="CRM · Nuevo presupuesto">
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/crm/presupuestos" variant="secondary">Volver al listado</ButtonLink>}
          description="Selecciona el cliente, agrega los productos y confirma el presupuesto."
          title="Nuevo presupuesto"
        />
        <Card>
          <QuoteEntryForm action={createQuoteAction} className="grid gap-4 p-4">
            <input name="returnTo" type="hidden" value="/crm/presupuestos?created=1" />
            <QuoteEntryFields
              clients={quoteFormData.clients}
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
              vendors={vendors}
            />
          </QuoteEntryForm>
        </Card>
      </div>
    </ModulePage>
  );
}
