"use client";

import { useState } from "react";
import { Button, Field, Input, SearchableSelect, Select } from "@/components/ui";
import { FISCAL_CONDITION_OPTIONS } from "@/lib/fiscal-conditions";
import { CUSTOMER_BUSINESS_SEGMENTS } from "@/lib/customer-segments";
import { CUSTOMER_RECEIPT_OPTIONS } from "@/lib/customer-receipt-types";

type CustomerLite = { id: string; name: string };

type EditableCustomer = {
  id: string;
  name: string;
  businessName: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  priceList: string;
  status: string;
  seller: string;
  assignedSeller: string;
  observation: string;
  salesCount: number;
  businessSegment: string;
  suggestedBusinessSegment: string;
  receiptType: string;
};

type Action = (formData: FormData) => Promise<void>;

type CustomerRowActionsProps = {
  customer: EditableCustomer;
  allClients: CustomerLite[];
  priceLists: string[];
  vendors: { id: string; name: string }[];
  canDelete: boolean;
  updateAction: Action;
  deleteAction: Action;
  mergeAction: Action;
};

export function CustomerRowActions({
  customer,
  allClients,
  priceLists,
  vendors,
  canDelete,
  updateAction,
  deleteAction,
  mergeAction,
}: CustomerRowActionsProps) {
  const [dialog, setDialog] = useState<"none" | "edit" | "delete" | "merge">("none");
  const [keepId, setKeepId] = useState("");
  const mergeTargets = allClients.filter((client) => client.id !== customer.id);
  const vendorNames = vendors.map((vendor) => vendor.name);
  const sellerOptions =
    vendorNames.includes(customer.seller) || !customer.seller ? vendorNames : [customer.seller, ...vendorNames];
  const assignedOptions =
    vendorNames.includes(customer.assignedSeller) || !customer.assignedSeller
      ? vendorNames
      : [customer.assignedSeller, ...vendorNames];

  return (
    <div className="flex flex-wrap gap-1">
      <Button onClick={() => setDialog("edit")} size="sm" type="button" variant="secondary">Editar</Button>
      {canDelete ? (
        <>
          <Button onClick={() => setDialog("merge")} size="sm" type="button" variant="secondary">Fusionar</Button>
          <Button onClick={() => setDialog("delete")} size="sm" type="button" variant="secondary">Eliminar</Button>
        </>
      ) : null}

      {dialog === "edit" ? (
        <Overlay description="Actualizá los datos comerciales, fiscales y de contacto." onClose={() => setDialog("none")} title="Editar cliente" wide>
          <form action={updateAction} className="flex max-h-[calc(100dvh-10rem)] flex-col" onSubmit={() => setDialog("none")}>
            <input name="id" type="hidden" value={customer.id} />
            <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4 lg:grid-cols-3">
              <EditorSection title="Identificación">
                <Field htmlFor={`edit-name-${customer.id}`} label="Nombre"><Input defaultValue={customer.name} id={`edit-name-${customer.id}`} name="name" required /></Field>
                <Field htmlFor={`edit-business-${customer.id}`} label="Razón social"><Input defaultValue={customer.businessName} id={`edit-business-${customer.id}`} name="businessName" /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field htmlFor={`edit-taxidtype-${customer.id}`} label="Tipo ID"><Input defaultValue={customer.taxIdType} id={`edit-taxidtype-${customer.id}`} name="taxIdType" placeholder="CUIT / DNI" /></Field>
                  <Field htmlFor={`edit-taxid-${customer.id}`} label="CUIT/DNI"><Input defaultValue={customer.taxId} id={`edit-taxid-${customer.id}`} name="taxId" /></Field>
                </div>
                <Field htmlFor={`edit-vat-${customer.id}`} label="Condición de IVA"><Select defaultValue={customer.vatCondition} id={`edit-vat-${customer.id}`} name="vatCondition">{FISCAL_CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition}</option>)}</Select></Field>
                <Field htmlFor={`edit-receipt-${customer.id}`} label="Comprobante asociado"><Select defaultValue={customer.receiptType} id={`edit-receipt-${customer.id}`} name="receiptType" required><option disabled value="">Seleccionar comprobante</option>{CUSTOMER_RECEIPT_OPTIONS.map((receiptType) => <option key={receiptType} value={receiptType}>{receiptType}</option>)}</Select></Field>
              </EditorSection>

              <EditorSection title="Contacto y ubicación">
                <Field htmlFor={`edit-phone-${customer.id}`} label="Teléfono"><Input defaultValue={customer.phone} id={`edit-phone-${customer.id}`} name="phone" /></Field>
                <Field htmlFor={`edit-address-${customer.id}`} label="Dirección"><Input defaultValue={customer.address} id={`edit-address-${customer.id}`} name="address" /></Field>
                <Field htmlFor={`edit-city-${customer.id}`} label="Localidad"><Input defaultValue={customer.city} id={`edit-city-${customer.id}`} name="city" /></Field>
                <Field htmlFor={`edit-province-${customer.id}`} label="Provincia"><Input defaultValue={customer.province} id={`edit-province-${customer.id}`} name="province" /></Field>
              </EditorSection>

              <EditorSection title="Configuración comercial">
                <Field htmlFor={`edit-segment-${customer.id}`} label="Rubro comercial"><Select defaultValue={customer.businessSegment} id={`edit-segment-${customer.id}`} name="businessSegment"><option value="">Sin clasificar</option>{customer.suggestedBusinessSegment && !customer.businessSegment ? <option value={customer.suggestedBusinessSegment}>Sugerido: {customer.suggestedBusinessSegment}</option> : null}{CUSTOMER_BUSINESS_SEGMENTS.filter((segment) => segment !== customer.suggestedBusinessSegment).map((segment) => <option key={segment} value={segment}>{segment}</option>)}</Select></Field>
                <Field htmlFor={`edit-pricelist-${customer.id}`} label="Lista de precios"><Select defaultValue={customer.priceList} id={`edit-pricelist-${customer.id}`} name="priceList"><option value="">Sin lista</option>{priceLists.map((list) => <option key={list} value={list}>{list}</option>)}</Select></Field>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Field htmlFor={`edit-status-${customer.id}`} label="Estado"><Select defaultValue={customer.status.trim().toLowerCase() === "inactivo" ? "inactivo" : "activo"} id={`edit-status-${customer.id}`} name="status"><option value="activo">Activo</option><option value="inactivo">Inactivo</option></Select></Field>
                  <Field htmlFor={`edit-seller-${customer.id}`} label="Vendedor propio"><Select defaultValue={customer.seller} id={`edit-seller-${customer.id}`} name="seller"><option value="">Sin asignar</option>{sellerOptions.map((name) => <option key={name} value={name}>{name}</option>)}</Select></Field>
                </div>
                <Field htmlFor={`edit-assigned-${customer.id}`} label="Vendedor a cargo"><Select defaultValue={customer.assignedSeller} id={`edit-assigned-${customer.id}`} name="assignedSeller"><option value="">Sin asignar</option>{assignedOptions.map((name) => <option key={name} value={name}>{name}</option>)}</Select></Field>
              </EditorSection>

              <div className="lg:col-span-3">
              <Field htmlFor={`edit-obs-${customer.id}`} label="Observación">
                <Input defaultValue={customer.observation} id={`edit-obs-${customer.id}`} name="observation" />
              </Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[color:var(--border)] bg-[color:var(--panel)] px-5 py-3">
              <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button size="sm" type="submit">Guardar</Button>
            </div>
          </form>
        </Overlay>
      ) : null}

      {dialog === "delete" ? (
        <Overlay onClose={() => setDialog("none")} title="Eliminar cliente">
          <p className="erp-text-body-sm">
            ¿Eliminar a <strong>{customer.name}</strong>? Esta acción no se puede deshacer.
            {customer.salesCount > 0 ? (
              <span className="mt-2 block font-semibold text-[color:var(--danger)]">
                Tiene {customer.salesCount} ventas: no se podrá eliminar (usá Fusionar).
              </span>
            ) : null}
          </p>
          <form action={deleteAction} className="mt-4 flex justify-end gap-2" onSubmit={() => setDialog("none")}>
            <input name="id" type="hidden" value={customer.id} />
            <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
            <Button size="sm" type="submit">Eliminar</Button>
          </form>
        </Overlay>
      ) : null}

      {dialog === "merge" ? (
        <Overlay onClose={() => setDialog("none")} title="Fusionar duplicado">
          <p className="erp-text-body-sm">
            Se moverá el historial de <strong>{customer.name}</strong>
            {customer.salesCount > 0 ? ` (${customer.salesCount} ventas)` : ""} al cliente que elijas, y
            <strong> {customer.name}</strong> se eliminará. Irreversible.
          </p>
          <form action={mergeAction} className="mt-4 grid gap-3" onSubmit={() => setDialog("none")}>
            <input name="duplicateId" type="hidden" value={customer.id} />
            <input name="keepId" type="hidden" value={keepId} />
            <Field htmlFor={`merge-keep-${customer.id}`} label="Cliente que se queda">
              <SearchableSelect
                id={`merge-keep-${customer.id}`}
                onChange={setKeepId}
                options={mergeTargets.map((client) => ({ value: client.id, label: client.name }))}
                placeholder="Buscar cliente…"
                value={keepId}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button disabled={!keepId} size="sm" type="submit">Fusionar</Button>
            </div>
          </form>
        </Overlay>
      ) : null}
    </div>
  );
}

function EditorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="grid content-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4"><h3 className="erp-text-body-sm font-black text-[color:var(--accent)]">{title}</h3>{children}</section>;
}

function Overlay({ children, description, onClose, title, wide = false }: { children: React.ReactNode; description?: string; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5" role="dialog">
      <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} type="button" />
      <div className={`relative z-10 w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] shadow-2xl ${wide ? "max-w-6xl" : "max-w-md p-5"}`}>
        <div className={wide ? "flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4" : ""}>
          <div><h2 className="erp-text-title-sm font-black">{title}</h2>{description ? <p className="mt-1 erp-text-caption text-[color:var(--muted)]">{description}</p> : null}</div>
          {wide ? <button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] text-xl text-[color:var(--muted)] hover:bg-[color:var(--background)]" onClick={onClose} type="button">×</button> : null}
        </div>
        <div className={wide ? "" : "mt-4"}>{children}</div>
      </div>
    </div>
  );
}
