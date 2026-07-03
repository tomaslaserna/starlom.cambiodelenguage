import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { issueCreditNoteAction, issueDebitNoteAction } from "@/app/billing/actions";
import { normalizeRole } from "@/lib/auth";
import {
  fiscalStatusLabel,
  getSaleCreditNotePreview,
  getSaleDebitNotePreview,
  type FiscalDocumentKind,
} from "@/lib/fiscal";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { uuidParam } from "@/lib/request-body";
import { SALES_READ_PERMISSION } from "@/lib/route-auth";

type FiscalNotePageProps = {
  kind: Exclude<FiscalDocumentKind, "invoice">;
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    message?: string;
  }>;
};

function receiptTypeLabel(receiptType: number, kind: Exclude<FiscalDocumentKind, "invoice">) {
  const className = receiptType === 3 || receiptType === 2 ? "A" : receiptType === 8 || receiptType === 7 ? "B" : "C";
  return `${kind === "credit_note" ? "Nota de Credito" : "Nota de Debito"} ${className}`;
}

function noteCopy(kind: Exclude<FiscalDocumentKind, "invoice">) {
  return kind === "credit_note"
    ? {
        title: "Emitir nota de credito",
        short: "NC",
        label: "nota de credito",
        approved: "Nota de credito aprobada fiscalmente.",
        button: "Emitir NC en ARCA",
        route: "credit-note",
      }
    : {
        title: "Emitir nota de debito",
        short: "ND",
        label: "nota de debito",
        approved: "Nota de debito aprobada fiscalmente.",
        button: "Emitir ND en ARCA",
        route: "debit-note",
      };
}

export async function FiscalNotePage({ kind, params, searchParams }: FiscalNotePageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const saleId = uuidParam(id, "Venta");
  const preview =
    kind === "credit_note"
      ? await getSaleCreditNotePreview(session.companyId, saleId)
      : await getSaleDebitNotePreview(session.companyId, saleId);
  const copy = noteCopy(kind);
  const role = normalizeRole(session.role);
  const canIssue = role === "administrador" || role === "jefe";
  const alreadyApproved = preview.creditNoteStatus === "aprobado" && preview.creditNoteCae.trim() !== "";
  const defaultReason = `${copy.label} factura ${preview.invoiceReceipt}`;
  const action = kind === "credit_note" ? issueCreditNoteAction : issueDebitNoteAction;

  return (
    <ModulePage
      active="billing"
      description={`Emision fiscal de ${copy.label} asociada a una factura aprobada.`}
      session={session}
      title={copy.title}
    >
      <div className="grid gap-5">
        <PageHeader
          title={copy.title}
          description="Revisa la factura original antes de emitir. ARCA generara un comprobante fiscal nuevo asociado a esta factura."
          actions={
            <ButtonLink href="/billing" size="sm" variant="secondary">
              Volver al registro
            </ButtonLink>
          }
        />

        {query.status === "approved" ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            {copy.approved}
          </div>
        ) : null}
        {query.status === "error" ? (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]">
            {query.message ?? `No se pudo emitir la ${copy.label}.`}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Factura original" value={preview.invoiceReceipt} />
          <StatCard label="Cliente" value={preview.customerName || "-"} />
          <StatCard label="Total factura" value={formatCurrency(preview.totalAmount)} tone="warning" />
          <StatCard label="Comprobante a emitir" value={receiptTypeLabel(preview.creditNoteReceiptType, kind)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Datos fiscales</CardTitle>
            <CardDescription>
              La nota queda vinculada a la factura original con comprobante asociado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="erp-text-caption font-semibold text-[color:var(--muted)]">CUIT/DNI</div>
              <div className="mt-1 font-mono text-sm">{preview.customerDocument || "-"}</div>
            </div>
            <div>
              <div className="erp-text-caption font-semibold text-[color:var(--muted)]">CAE factura</div>
              <div className="mt-1 font-mono text-sm">{preview.invoiceCae}</div>
            </div>
            <div>
              <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Estado {copy.short}</div>
              <div className="mt-1">
                <StatusBadge tone={alreadyApproved ? "success" : preview.creditNoteStatus === "error" ? "danger" : "warning"}>
                  {preview.creditNoteStatus ? fiscalStatusLabel(preview.creditNoteStatus) : "Sin emitir"}
                </StatusBadge>
              </div>
            </div>
            <div>
              <div className="erp-text-caption font-semibold text-[color:var(--muted)]">{copy.short} emitida</div>
              <div className="mt-1 font-mono text-sm">
                {preview.creditNoteReceipt || "-"}
                {preview.creditNoteCae ? ` · CAE ${preview.creditNoteCae}` : ""}
              </div>
            </div>
            {preview.creditNoteErrorMessage ? (
              <div className="md:col-span-2 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm text-[color:var(--danger)]">
                {preview.creditNoteErrorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Confirmacion</CardTitle>
            <CardDescription>
              Esta accion emite una {copy.label} fiscal real. No modifica ni borra el CAE de la factura original.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alreadyApproved ? (
              <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
                Esta factura ya tiene {copy.label} fiscal aprobada.
              </div>
            ) : canIssue ? (
              <form action={action} className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
                <input name="saleId" type="hidden" value={preview.saleId} />
                <Field htmlFor={`${copy.route}-amount`} label="Monto">
                  <Input
                    id={`${copy.route}-amount`}
                    min="0.01"
                    name="amount"
                    step="0.01"
                    type="number"
                    defaultValue={preview.totalAmount.toFixed(2)}
                  />
                </Field>
                <Field htmlFor={`${copy.route}-reason`} label="Motivo">
                  <Input id={`${copy.route}-reason`} name="reason" defaultValue={defaultReason} />
                </Field>
                <div className="flex items-end">
                  <Button className="w-full md:w-auto" size="sm" type="submit" variant="danger">
                    {copy.button}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--muted)]">
                Solo Administrador o Jefe pueden emitir notas fiscales.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
