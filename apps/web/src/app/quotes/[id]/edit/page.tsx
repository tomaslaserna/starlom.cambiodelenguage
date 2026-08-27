import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getOrderFormData } from "@/lib/orders";
import { listVendors } from "@/lib/imports";
import { getQuote } from "@/lib/quotes";
import { requirePagePermission } from "@/lib/page-auth";
import { updateQuoteAction } from "@/app/quotes/actions";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";
import { QuoteEntryForm } from "@/app/quotes/quote-entry-form";

type EditQuotePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditQuotePage({ params }: EditQuotePageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "presupuestos", action: "editar" }]);
  const { id } = await params;

  const quote = await getQuote(session.companyId, id).catch(() => null);
  if (!quote) redirect("/quotes?error=Presupuesto%20no%20encontrado");
  if (quote.status !== "pendiente") {
    redirect("/quotes?error=Solo%20se%20pueden%20editar%20presupuestos%20pendientes");
  }

  const [quoteFormData, vendors] = await Promise.all([
    getOrderFormData(session.companyId),
    listVendors(session.companyId),
  ]);

  const customerId = quote.clientId ?? "";

  const initialValues = {
    customerId,
    customerName: quote.customer.name,
    customerBusinessName: quote.customer.businessName,
    customerTaxId: quote.customer.taxId,
    customerVatCondition: quote.customer.vatCondition,
    customerPhone: quote.customer.phone,
    customerAddress: quote.customer.address,
    desiredDocument: quote.desiredDocument ?? "remito",
    validityDays: String(quote.validityDays ?? 15),
    priceListOverride: quote.priceListName ?? "",
    assignedSellerId: quote.visibleToAll ? "" : (quote.sellerId ?? ""),
    lines: (Array.isArray(quote.products) ? quote.products : [])
      .filter((product) => Boolean(product?.id))
      .map((product) => ({
        productId: String(product.id),
        quantity: String(product.quantity ?? 1),
        discount: String(product.discount ?? 0),
        unitPrice: String(product.unitPrice ?? 0),
      })),
  };

  return (
    <ModulePage active="sales" description="Editar presupuesto pendiente." session={session} title={`Editar ${quote.quoteNumber}`}>
      <div className="grid gap-5">
        <PageHeader description={`Presupuesto ${quote.quoteNumber}`} title="Editar presupuesto" />
        <Card>
          <QuoteEntryForm action={updateQuoteAction} className="grid gap-4 p-4">
            <QuoteEntryFields
              clients={quoteFormData.clients}
              initialValues={initialValues}
              mode="edit"
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
              quoteId={quote.id}
              vendors={vendors}
            />
          </QuoteEntryForm>
        </Card>
      </div>
    </ModulePage>
  );
}
