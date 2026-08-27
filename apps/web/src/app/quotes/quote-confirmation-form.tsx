"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, ButtonLink, Field, Input, SearchableSelect, Select } from "@/components/ui";
import { FISCAL_CONDITION_OPTIONS } from "@/lib/fiscal-conditions";
import type { OrderFormClient } from "@/lib/orders";

type QuoteConfirmationFormProps = {
  action: (formData: FormData) => Promise<void>;
  clients: OrderFormClient[];
  quote: {
    id: string;
    clientId: string;
    customerName: string;
    businessName: string;
    taxId: string;
    vatCondition: string;
    phone: string;
    address: string;
    desiredDocument: string;
  };
};

function ConfirmSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={disabled || pending} type="submit">
      {pending ? "Creando cliente y pedido…" : "Confirmar y enviar a Pedidos"}
    </Button>
  );
}

export function QuoteConfirmationForm({ action, clients, quote }: QuoteConfirmationFormProps) {
  const alreadyLinked = Boolean(quote.clientId);
  const [mode, setMode] = useState<"existing" | "new">(alreadyLinked ? "existing" : "existing");
  const [existingCustomerId, setExistingCustomerId] = useState(quote.clientId);
  const existingOptions = useMemo(() => clients.map((client) => ({
    value: client.id,
    label: client.name,
    description: [client.taxId, client.legalName && client.legalName !== client.name ? client.legalName : ""]
      .filter(Boolean)
      .join(" - "),
    searchText: [client.legalName, client.taxId, client.phone, client.address].filter(Boolean).join(" "),
  })), [clients]);
  const canRequestFiscal = quote.desiredDocument === "factura_a" || quote.desiredDocument === "factura_b";

  return (
    <form action={action} className="grid gap-5">
      <input name="id" type="hidden" value={quote.id} />
      <input name="customerMode" type="hidden" value={mode} />

      {alreadyLinked ? (
        <div className="rounded-lg border border-[color:var(--success)]/35 bg-[color:var(--success-subtle)] p-4">
          <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Cliente asociado</div>
          <div className="erp-text-body font-black">{quote.customerName}</div>
          <input name="existingCustomerId" type="hidden" value={quote.clientId} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setMode("existing")} type="button" variant={mode === "existing" ? "primary" : "secondary"}>
              Vincular cliente cargado
            </Button>
            <Button onClick={() => setMode("new")} type="button" variant={mode === "new" ? "primary" : "secondary"}>
              Crear cliente desde prospecto
            </Button>
          </div>

          {mode === "existing" ? (
            <Field
              description="Elegí el cliente que cargaste. No vinculamos nombres parecidos automáticamente para evitar asignar una venta a otra cuenta."
              htmlFor="quote-confirm-existing-customer"
              label="Cliente registrado"
              required
            >
              <SearchableSelect
                id="quote-confirm-existing-customer"
                name="existingCustomerId"
                onChange={setExistingCustomerId}
                options={existingOptions}
                placeholder="Buscar por nombre, razón social o CUIT"
                required
                value={existingCustomerId}
              />
            </Field>
          ) : (
            <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-2">
              <Field htmlFor="quote-confirm-name" label="Nombre comercial" required>
                <Input defaultValue={quote.customerName} id="quote-confirm-name" name="customerName" required />
              </Field>
              <Field htmlFor="quote-confirm-business" label="Razón social">
                <Input defaultValue={quote.businessName} id="quote-confirm-business" name="customerBusinessName" />
              </Field>
              <Field htmlFor="quote-confirm-tax-id" label="CUIT/DNI">
                <Input defaultValue={quote.taxId} id="quote-confirm-tax-id" name="customerTaxId" />
              </Field>
              <Field htmlFor="quote-confirm-vat" label="Condición IVA">
                <Select defaultValue={quote.vatCondition} id="quote-confirm-vat" name="customerVatCondition">
                  <option value="">Seleccionar</option>
                  {FISCAL_CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                </Select>
              </Field>
              <Field htmlFor="quote-confirm-phone" label="Teléfono" required>
                <Input defaultValue={quote.phone} id="quote-confirm-phone" name="customerPhone" required />
              </Field>
              <Field htmlFor="quote-confirm-address" label="Dirección de entrega" required>
                <Input defaultValue={quote.address} id="quote-confirm-address" name="customerAddress" required />
              </Field>
              <Field htmlFor="quote-confirm-city" label="Localidad">
                <Input id="quote-confirm-city" name="customerCity" />
              </Field>
              <Field htmlFor="quote-confirm-province" label="Provincia">
                <Input defaultValue="Córdoba" id="quote-confirm-province" name="customerProvince" />
              </Field>
            </div>
          )}
        </>
      )}

      {canRequestFiscal ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--border)] bg-white p-4 text-sm font-semibold">
          <input className="mt-1" name="requestFiscalInvoice" type="checkbox" value="true" />
          <span>
            Solicitar factura fiscal
            <span className="mt-1 block text-xs font-normal text-[color:var(--muted)]">
              Para solicitarla, el cliente debe tener CUIT y condición fiscal completos.
            </span>
          </span>
        </label>
      ) : null}

      <div className="rounded-lg border border-[color:var(--border)] bg-white p-4 text-sm text-[color:var(--muted)]">
        Al confirmar se crea el pedido con los productos, descuentos y precios congelados del presupuesto. El stock todavía no se descuenta: seguirá el circuito normal de autorización y entrega.
      </div>

      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        <ButtonLink href="/quotes" variant="secondary">Cancelar</ButtonLink>
        <ConfirmSubmitButton disabled={!alreadyLinked && mode === "existing" && !existingCustomerId} />
      </div>
    </form>
  );
}
