"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { PriceListRecipient } from "@/lib/price-list-followups";

export function PriceListExportForm({
  listId,
  listName,
  customers,
  defaultDate,
}: {
  listId: number;
  listName: string;
  customers: PriceListRecipient[];
  defaultDate: string;
}) {
  const [recipientType, setRecipientType] = useState<"cliente" | "prospecto">("prospecto");

  return (
    <form
      action="/api/pricing/price-list-exports"
      className="absolute right-0 z-20 mt-2 grid w-[min(92vw,380px)] gap-3 rounded-[12px] border border-[#d9e2ef] bg-white p-4 shadow-[var(--shadow-lg)]"
      method="POST"
      target="_blank"
    >
      <input name="list" type="hidden" value={listId} />
      <p className="erp-text-caption font-black text-[#0f172a]">Compartir “{listName}”</p>
      <p className="rounded-[9px] bg-[#eef4ff] px-3 py-2 text-xs font-semibold leading-relaxed text-[#334155]">
        El destinatario queda registrado automáticamente como una señal comercial para su seguimiento.
      </p>
      <Field htmlFor="pdf-recipient-type" label="¿Para quién es?">
        <Select id="pdf-recipient-type" name="recipientType" value={recipientType} onChange={(event) => setRecipientType(event.target.value as "cliente" | "prospecto")}>
          <option value="prospecto">Prospecto nuevo</option>
          <option value="cliente">Cliente existente</option>
        </Select>
      </Field>
      {recipientType === "cliente" ? (
        <Field htmlFor="pdf-customer" label="Cliente">
          <Select id="pdf-customer" name="customerId" required>
            <option value="">Seleccionar cliente</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </Select>
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field htmlFor="pdf-prospect-name" label="Nombre o comercio">
            <Input id="pdf-prospect-name" name="prospectName" required />
          </Field>
          <Field htmlFor="pdf-prospect-phone" label="WhatsApp (opcional)">
            <Input id="pdf-prospect-phone" name="prospectPhone" inputMode="tel" />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field htmlFor="pdf-purpose" label="Motivo">
          <Select defaultValue="Consulta de precios" id="pdf-purpose" name="purpose">
            <option>Consulta de precios</option>
            <option>Primera propuesta</option>
            <option>Oportunidad concreta</option>
            <option>Actualización de precios</option>
            <option>Reposición estimada</option>
          </Select>
        </Field>
        <Field htmlFor="pdf-follow-up" label="Volver a revisar en">
          <Select defaultValue="7" id="pdf-follow-up" name="followUpDays">
            <option value="3">3 días</option>
            <option value="7">7 días</option>
            <option value="15">15 días</option>
            <option value="30">30 días</option>
          </Select>
        </Field>
      </div>
      <Field htmlFor="pdf-vigencia" label="Vigencia desde">
        <Input defaultValue={defaultDate} id="pdf-vigencia" name="vigencia" type="date" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field htmlFor="pdf-stock" label="Productos">
          <Select defaultValue="todos" id="pdf-stock" name="stock">
            <option value="todos">Todos</option>
            <option value="con">Solo con stock</option>
          </Select>
        </Field>
        <Field htmlFor="pdf-group" label="Agrupar por">
          <Select defaultValue="categoria" id="pdf-group" name="groupBy">
            <option value="categoria">Categoría</option>
            <option value="proveedor">Proveedor</option>
          </Select>
        </Field>
      </div>
      <Field htmlFor="pdf-filter" label="Filtrar (opcional)">
        <Input id="pdf-filter" name="filter" placeholder="Categoría o proveedor" />
      </Field>
      <p className="text-xs font-semibold text-[#64748b]">El PDF muestra precios netos, sin IVA.</p>
      <Button type="submit">Registrar y generar PDF</Button>
    </form>
  );
}
