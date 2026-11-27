import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  SALES_READ_PERMISSION,
  SALES_OPERATE_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { uuidParam } from "@/lib/request-body";
import {
  getFiscalReissue,
  previewFiscalReissue,
  reissueFingerprint,
} from "@/lib/fiscal-reissue";
import { formatCurrency } from "@/lib/format";
export const maxDuration = 300;
import { reissueAction } from "./actions";
export default async function ReissuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; mode?: string }>;
}) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const { id } = await params;
  const saleId = uuidParam(id, "Venta");
  const query = await searchParams;
  const record = await getFiscalReissue(session.companyId, saleId);
  let error = "";
  let snapshot = record?.snapshot;
  if (!snapshot) {
    try {
      snapshot = await previewFiscalReissue(
        session.companyId,
        saleId,
        undefined,
        query.mode === "net_returns",
      );
    } catch (e) {
      error = e instanceof Error ? e.message : "No disponible";
    }
  }
  const canIssue = await sessionAllows(session, [SALES_OPERATE_PERMISSION]);
  const number = snapshot
    ? `${String(snapshot.original.pointOfSale).padStart(4, "0")}-${String(snapshot.original.receiptNumber).padStart(8, "0")}`
    : "";
  return (
    <ModulePage
      active="billing"
      title="Refacturación fiscal"
      description="Cambio de destinatario fiscal de una operación existente."
      session={session}
    >
      <div className="grid gap-5">
        <PageHeader
          title="Refacturación por cambio de razón social"
          description="Nota de crédito total y factura de reemplazo. Conserva la venta, entrega, stock y cobros existentes."
          actions={
            <ButtonLink href="/billing" variant="secondary">
              Volver a Fiscal
            </ButtonLink>
          }
        />
        {query.message ? <Card className="p-4">{query.message}</Card> : null}
        {error ? (
          <Card className="p-4">
            {error}
            <div className="mt-3">
              <ButtonLink
                href={`/billing/reissue/${saleId}?mode=net_returns`}
                variant="secondary"
              >
                Conciliar devoluciones y ver reemplazo neto
              </ButtonLink>
            </div>
          </Card>
        ) : null}
        {snapshot ? (
          <>
            <Card className="grid gap-3 p-5">
              <p className="font-semibold">
                Factura A {number} — {formatCurrency(snapshot.total)}
              </p>
              <p>
                Original: {snapshot.source.name} · CUIT{" "}
                {snapshot.source.document} · {snapshot.source.condition}
              </p>
              <p>
                Nuevo destinatario: {snapshot.target.name} · CUIT{" "}
                {snapshot.target.document} · {snapshot.target.condition}
              </p>
              <p>
                Factura de reemplazo:{" "}
                {formatCurrency(snapshot.replacementTotal ?? snapshot.total)}
                {snapshot.operationalReturns?.length
                  ? ` · descontadas ${snapshot.operationalReturns.length} devoluciones internas ya aplicadas`
                  : ""}
              </p>
              <p>
                IVA: {snapshot.vatRate}% · {snapshot.items.length} renglones ·{" "}
                {snapshot.paymentCondition}
              </p>
              <p className="font-semibold">
                {record?.state === "completed"
                  ? "Completado: reemplazo vigente"
                  : record?.credit
                    ? "Refacturación incompleta: original anulada, falta factura de reemplazo"
                    : record
                      ? "Refacturación en curso: autorización pendiente de verificar"
                      : "Sin iniciar"}
              </p>
              {record?.error ? <p>{record.error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <ButtonLink
                  href={`/api/pdfs/fiscal/sales/${saleId}`}
                  prefetch={false}
                  variant="secondary"
                >
                  PDF original
                </ButtonLink>
                {record?.credit ? (
                  <ButtonLink
                    href={`/api/pdfs/fiscal/reissues/${saleId}?stage=credit`}
                    prefetch={false}
                  >
                    PDF nota de crédito
                  </ButtonLink>
                ) : null}
                {record?.invoice ? (
                  <ButtonLink
                    href={`/api/pdfs/fiscal/reissues/${saleId}?stage=invoice`}
                    prefetch={false}
                  >
                    PDF factura vigente
                  </ButtonLink>
                ) : null}
              </div>
            </Card>
            {canIssue && record?.state !== "completed" ? (
              <Card className="p-5">
                <form action={reissueAction} className="grid gap-4">
                  <input
                    type="hidden"
                    name="mode"
                    value={query.mode || "full"}
                  />
                  <input type="hidden" name="saleId" value={saleId} />
                  <input
                    type="hidden"
                    name="fingerprint"
                    value={reissueFingerprint(snapshot)}
                  />
                  <Field label="Razón social del comprobante original (confirmar)">
                    <Input
                      name="originalName"
                      required
                      maxLength={255}
                      defaultValue={snapshot.source.name}
                      readOnly={Boolean(record)}
                    />
                  </Field>
                  <Field label="Observaciones / motivo de la nota de crédito">
                    <Input
                      name="reason"
                      required
                      maxLength={500}
                      defaultValue={record?.reason || "Cambio de razón social"}
                      readOnly={Boolean(record)}
                    />
                  </Field>
                  <p>
                    Se emitirán comprobantes fiscales en ARCA por el mismo
                    importe. Los reintentos verifican el número reservado antes
                    de continuar.
                  </p>
                  <Button type="submit">
                    {record
                      ? "Verificar y continuar etapa pendiente"
                      : "Emitir NC y factura de reemplazo"}
                  </Button>
                </form>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </ModulePage>
  );
}
