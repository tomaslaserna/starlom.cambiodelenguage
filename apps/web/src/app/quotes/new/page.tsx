import { filterCustomerAccess } from "@/lib/customer-access";
import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { listVendors } from "@/lib/imports";
import { getOrderFormData } from "@/lib/orders";
import { requirePagePermission } from "@/lib/page-auth";
import { QUOTES_CREATE_PERMISSION } from "@/lib/route-auth";
import { createQuoteAction } from "@/app/quotes/actions";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";
import { QuoteEntryForm } from "@/app/quotes/quote-entry-form";
import { getSegmentGuide } from "@/lib/segment-guide";
import { pricedSegmentBase } from "@/lib/segment-guide-domain";
import { resolvePriceListName } from "@/lib/order-pricing";
import { formatDate } from "@/lib/format";
import { notFound } from "next/navigation";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{base?: string}> }) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [QUOTES_CREATE_PERMISSION]);

  const [quoteFormData, vendors] = await Promise.all([
    getOrderFormData(session.companyId),
    listVendors(session.companyId),
  ]);
  const params = await searchParams;
  const guide = params.base ? await getSegmentGuide(session.companyId) : null;
  const base = guide?.segments.find(group => group.segment === params.base);
  if (params.base && !base) notFound();
  const priceList = resolvePriceListName("", quoteFormData.priceLists);
  const selection = base ? pricedSegmentBase(base, quoteFormData.products, priceList) : null;

  return (
    <ModulePage active="sales" description="Carga ordenada de un nuevo presupuesto." session={session} title="Nuevo presupuesto">
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href={base ? "/quotes/base" : "/quotes"} variant="secondary">{base ? "Volver a presupuestos base" : "Volver al listado"}</ButtonLink>}
          description="Selecciona el cliente, agrega los productos y confirma el presupuesto."
          title="Nuevo presupuesto"
        />
        {base && guide ? <Card className="grid gap-2 p-4 text-sm">
          <p className="font-semibold">Base de {base.segment}{base.preliminary ? " · preliminar" : ""}</p>
          <p>{base.customerCount} clientes compradores · {base.orderCount} pedidos · {formatDate(guide.period.from)} al {formatDate(guide.period.through)}.</p>
          <p>Cantidades promedio por pedido con cada producto; no consumo mensual. Revisá alternativas y cantidades, completá el nombre del prospecto y elegí el comprobante. Podés agregar y quitar productos. Todavía no se guardó ningún presupuesto.</p>
          {base.preliminary ? <p className="text-amber-800">Muestra menor a 5 compradores: validá la sugerencia con el cliente.</p> : null}
          {selection?.unavailable.length ? <p role="alert" className="text-amber-800">No se precargaron por falta de precio vigente o catálogo: {selection.unavailable.join(", ")}.</p> : null}
          {!selection?.lines.length ? <p className="text-amber-800">Sin productos habituales con precio vigente. Podés armar el presupuesto manualmente.</p> : null}
        </Card> : null}
        <Card>
          <QuoteEntryForm action={createQuoteAction} className="grid gap-4 p-4">
            <input name="returnTo" type="hidden" value="/quotes?created=1" />
            <QuoteEntryFields
              clients={await filterCustomerAccess(session, quoteFormData.clients)}
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
              vendors={vendors}
              initialValues={base && selection ? {
                customerId: "", validityDays: "15", priceListOverride: priceList,
                assignedSellerId: session.userId, lines: selection.lines,
              } : undefined}
            />
          </QuoteEntryForm>
        </Card>
      </div>
    </ModulePage>
  );
}
