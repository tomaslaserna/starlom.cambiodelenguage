"use client";

import { useState } from "react";
import { Button, Field, Input, SearchableSelect, Select } from "@/components/ui";

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
  observation: string;
  salesCount: number;
};

type Action = (formData: FormData) => Promise<void>;

type CustomerRowActionsProps = {
  customer: EditableCustomer;
  allClients: CustomerLite[];
  priceLists: string[];
  canDelete: boolean;
  updateAction: Action;
  deleteAction: Action;
  mergeAction: Action;
};

export function CustomerRowActions({
  customer,
  allClients,
  priceLists,
  canDelete,
  updateAction,
  deleteAction,
  mergeAction,
}: CustomerRowActionsProps) {
  const [dialog, setDialog] = useState<"none" | "edit" | "delete" | "merge">("none");
  const [keepId, setKeepId] = useState("");
  const mergeTargets = allClients.filter((client) => client.id !== customer.id);

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
        <Overlay onClose={() => setDialog("none")} title="Editar cliente">
          <form action={updateAction} className="grid gap-3 sm:grid-cols-2" onSubmit={() => setDialog("none")}>
            <input name="id" type="hidden" value={customer.id} />
            <Field htmlFor={`edit-name-${customer.id}`} label="Nombre">
              <Input defaultValue={customer.name} id={`edit-name-${customer.id}`} name="name" required />
            </Field>
            <Field htmlFor={`edit-business-${customer.id}`} label="Razón social">
              <Input defaultValue={customer.businessName} id={`edit-business-${customer.id}`} name="businessName" />
            </Field>
            <Field htmlFor={`edit-taxidtype-${customer.id}`} label="Tipo ID">
              <Input defaultValue={customer.taxIdType} id={`edit-taxidtype-${customer.id}`} name="taxIdType" placeholder="CUIT / DNI" />
            </Field>
            <Field htmlFor={`edit-taxid-${customer.id}`} label="CUIT/DNI">
              <Input defaultValue={customer.taxId} id={`edit-taxid-${customer.id}`} name="taxId" />
            </Field>
            <Field htmlFor={`edit-vat-${customer.id}`} label="Cond. IVA">
              <Input defaultValue={customer.vatCondition} id={`edit-vat-${customer.id}`} name="vatCondition" />
            </Field>
            <Field htmlFor={`edit-phone-${customer.id}`} label="Teléfono">
              <Input defaultValue={customer.phone} id={`edit-phone-${customer.id}`} name="phone" />
            </Field>
            <Field htmlFor={`edit-address-${customer.id}`} label="Dirección">
              <Input defaultValue={customer.address} id={`edit-address-${customer.id}`} name="address" />
            </Field>
            <Field htmlFor={`edit-city-${customer.id}`} label="Localidad">
              <Input defaultValue={customer.city} id={`edit-city-${customer.id}`} name="city" />
            </Field>
            <Field htmlFor={`edit-province-${customer.id}`} label="Provincia">
              <Input defaultValue={customer.province} id={`edit-province-${customer.id}`} name="province" />
            </Field>
            <Field htmlFor={`edit-pricelist-${customer.id}`} label="Lista de precios">
              <Select defaultValue={customer.priceList} id={`edit-pricelist-${customer.id}`} name="priceList">
                <option value="">Sin lista</option>
                {priceLists.map((list) => (
                  <option key={list} value={list}>{list}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor={`edit-status-${customer.id}`} label="Estado">
              <Select
                defaultValue={customer.status.trim().toLowerCase() === "inactivo" ? "inactivo" : "activo"}
                id={`edit-status-${customer.id}`}
                name="status"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </Select>
            </Field>
            <Field htmlFor={`edit-seller-${customer.id}`} label="Vendedor">
              <Input defaultValue={customer.seller} id={`edit-seller-${customer.id}`} name="seller" />
            </Field>
            <div className="sm:col-span-2">
              <Field htmlFor={`edit-obs-${customer.id}`} label="Observación">
                <Input defaultValue={customer.observation} id={`edit-obs-${customer.id}`} name="observation" />
              </Field>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
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

function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} type="button" />
      <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="erp-text-title-sm font-black">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
