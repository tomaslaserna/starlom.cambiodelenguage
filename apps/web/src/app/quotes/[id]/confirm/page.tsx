import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { acceptQuoteAction } from "@/app/quotes/actions";
import { QuoteConfirmationForm } from "@/app/quotes/quote-confirmation-form";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { getOrderFormData } from "@/lib/orders";
import { requirePagePermission } from "@/lib/page-auth";
import { getQuote } from "@/lib/quotes";
import { desiredDocumentLabel } from "@/lib/receipt-types";

type ConfirmQuotePageProps = { params: Promise<{ id: string }> };

export default async function ConfirmQuotePage({ params }: ConfirmQuotePageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "presupuestos", action: "aprobar" }]);
  const { id } = await params;
  const quote = await getQuote(session.companyId, id).catch(() => null);
  if (!quote) redirect("/quotes?error=Presupuesto%20no%20encontrado");
  if (quote.status !== "pendiente") redirect("/quotes?error=El%20presupuesto%20ya%20no%20esta%20pendiente");
  if (quote.valid === false) redirect("/quotes?error=El%20presupuesto%20esta%20vencido%20y%20debe%20actualizarse");

  const formData = await getOrderFormData(session.companyId);

  return (
    <ModulePage active="sales" description="Alta o vinculación del cliente y conversión directa a Pedidos." session={session} title={`Confirmar ${quote.quoteNumber}`}>
      <div className="grid gap-5">
        <PageHeader description="Los precios del presupuesto se mantienen; solo completamos la identidad y entrega del cliente." title={`Confirmar ${quote.quoteNumber}`} />
        <Card className="grid gap-4 p-5">
          <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="erp-text-caption text-[color:var(--muted)]">Prospecto</div><div className="font-bold">{quote.customer.name}</div></div>
            <div><div className="erp-text-caption text-[color:var(--muted)]">Vigencia</div><div className="font-bold">Hasta {formatDate(quote.expirationDate)}</div></div>
            <div><div className="erp-text-caption text-[color:var(--muted)]">Comprobante</div><div className="font-bold">{desiredDocumentLabel(quote.desiredDocument ?? "remito")}</div></div>
            <div><div className="erp-text-caption text-[color:var(--muted)]">Total congelado</div><div className="font-mono font-black">{formatCurrency(quote.total)}</div></div>
          </div>
          <QuoteConfirmationForm
            action={acceptQuoteAction}
            clients={formData.clients}
            quote={{
              id: quote.id,
              clientId: quote.clientId,
              customerName: quote.customer.name,
              businessName: quote.customer.businessName,
              taxId: quote.customer.taxId,
              vatCondition: quote.customer.vatCondition,
              phone: quote.customer.phone,
              address: quote.customer.address,
              desiredDocument: quote.desiredDocument ?? "remito",
            }}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
