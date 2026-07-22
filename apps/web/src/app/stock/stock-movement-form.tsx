"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { InventoryProduct } from "@/lib/inventory";
import type { StockImportMode } from "@/lib/stock-import";

type StockMovementFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  idempotencyKey: string;
  onCancel: () => void;
  product: InventoryProduct;
};

const stockModes: { label: string; value: StockImportMode }[] = [
  { label: "Agregar", value: "entrada" },
  { label: "Quitar", value: "salida" },
  { label: "Corregir total", value: "exacto" },
];

const reasonOptions = [
  "Compra a proveedor",
  "Devolución de cliente",
  "Rotura o vencimiento",
  "Uso interno",
  "Recuento físico",
  "Corrección de carga",
  "Otro ajuste",
];

const defaultReasonByMode: Record<StockImportMode, string> = {
  entrada: "Compra a proveedor",
  salida: "Rotura o vencimiento",
  exacto: "Recuento físico",
};

const MAX_STOCK_QUANTITY = 1_000_000_000;

export function StockMovementForm({ action, idempotencyKey, onCancel, product }: StockMovementFormProps) {
  const [mode, setMode] = useState<StockImportMode>("entrada");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState(defaultReasonByMode.entrada);
  const [observations, setObservations] = useState("");
  const parsedQuantity = Number(quantity);
  const hasQuantity = quantity.trim() !== "" && Number.isFinite(parsedQuantity);
  const quantityError = !hasQuantity
    ? ""
    : !Number.isInteger(parsedQuantity)
      ? "La cantidad debe ser un número entero"
      : mode === "exacto" && parsedQuantity < 0
        ? "El stock exacto no puede ser negativo"
        : mode !== "exacto" && parsedQuantity <= 0
          ? "La cantidad debe ser mayor a cero"
          : parsedQuantity > MAX_STOCK_QUANTITY
            ? "La cantidad supera el límite permitido"
            : "";
  const hasValidQuantity = hasQuantity && !quantityError;
  const resultingStock = hasValidQuantity
    ? mode === "entrada"
      ? product.stock + parsedQuantity
      : mode === "salida"
        ? product.stock - parsedQuantity
        : parsedQuantity
    : product.stock;
  const wouldBeNegative = hasValidQuantity && resultingStock < 0;
  const validationMessage = quantityError || (wouldBeNegative ? "No puedes dejar el stock en negativo" : "");
  const minimumQuantity = mode === "exacto" ? 0 : 1;
  const recordedReason = observations.trim() ? `${reason}: ${observations.trim()}` : reason;

  function selectMode(nextMode: StockImportMode) {
    setMode(nextMode);
    setQuantity(
      nextMode === "exacto"
        ? String(Math.min(MAX_STOCK_QUANTITY, Math.max(0, Math.round(product.stock))))
        : "1",
    );
    setReason(defaultReasonByMode[nextMode]);
  }

  function changeQuantity(delta: number) {
    const currentQuantity = Number.isInteger(parsedQuantity) ? parsedQuantity : minimumQuantity;
    setQuantity(String(Math.min(MAX_STOCK_QUANTITY, Math.max(minimumQuantity, currentQuantity + delta))));
  }

  return (
    <form action={action} className="grid gap-4">
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="productId" type="hidden" value={product.id} />
      <input name="mode" type="hidden" value={mode} />
      <input name="reason" type="hidden" value={recordedReason} />

      <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] sm:grid-cols-3">
        <div className="min-w-0 border-b border-[color:var(--border)] p-3 sm:col-span-2 sm:border-b-0 sm:border-r">
          <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Producto</div>
          <div className="mt-1 truncate font-semibold">{product.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]">
            <span>SKU: {product.code || "Sin código"}</span>
            <span>{product.category || "Sin categoría"}</span>
            <span>{product.supplier || "Sin proveedor"}</span>
          </div>
        </div>
        <div className="p-3 sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Stock actual</div>
          <div className="mt-1 font-semibold">{formatNumber(product.stock)}</div>
        </div>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-semibold">Tipo de ajuste</legend>
        <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-1">
          {stockModes.map((stockMode) => (
            <Button
              aria-pressed={mode === stockMode.value}
              className="w-full shadow-none"
              key={stockMode.value}
              onClick={() => selectMode(stockMode.value)}
              type="button"
              variant={mode === stockMode.value ? "primary" : "ghost"}
            >
              {stockMode.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          htmlFor="stock-movement-quantity"
          label={mode === "exacto" ? "Nuevo stock total" : mode === "entrada" ? "Cantidad a agregar" : "Cantidad a quitar"}
          required
        >
          <div className="grid grid-cols-[var(--control-height-md)_1fr_var(--control-height-md)] overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--field)] shadow-[var(--shadow-control)] transition-[border-color,box-shadow] focus-within:border-[color:var(--border-strong)] focus-within:ring-2 focus-within:ring-[color:var(--border)]">
            <button
              aria-label="Restar una unidad"
              className="border-r border-[color:var(--border)] text-xl font-bold text-[color:var(--accent-strong)] hover:bg-[color:var(--panel-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={parsedQuantity <= minimumQuantity}
              onClick={() => changeQuantity(-1)}
              type="button"
            >
              −
            </button>
            <Input
              className="h-[var(--control-height-md)] min-h-0 rounded-none border-0 text-center text-base font-bold shadow-none focus:border-0 focus-visible:outline-none"
              data-stock-quantity
              id="stock-movement-quantity"
              inputMode="numeric"
              invalid={Boolean(quantityError)}
              max={String(MAX_STOCK_QUANTITY)}
              min={String(minimumQuantity)}
              name="quantity"
              onChange={(event) => setQuantity(event.target.value)}
              required
              step="1"
              style={{ boxShadow: "none", outline: "none" }}
              type="number"
              value={quantity}
            />
            <button
              aria-label="Sumar una unidad"
              className="border-l border-[color:var(--border)] text-xl font-bold text-[color:var(--accent-strong)] hover:bg-[color:var(--panel-subtle)]"
              disabled={parsedQuantity >= MAX_STOCK_QUANTITY}
              onClick={() => changeQuantity(1)}
              type="button"
            >
              +
            </button>
          </div>
        </Field>
        <div
          aria-live="polite"
          className={`grid min-h-[72px] content-center rounded-[var(--radius-md)] border px-4 py-3 ${
            validationMessage
              ? "border-[color:var(--danger)] bg-[color:var(--danger-subtle)] text-[color:var(--danger)]"
              : "border-[color:var(--border)] bg-[color:var(--panel-subtle)]"
          }`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide">{validationMessage || "Nuevo stock final"}</span>
          <strong className="mt-1 text-xl">{formatNumber(resultingStock)} unidades</strong>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="content-start" htmlFor="stock-movement-reason" label="Motivo del ajuste" required>
          <Select
            id="stock-movement-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          >
            {reasonOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
        <Field
          className="content-start"
          description={`${observations.length}/300 caracteres`}
          htmlFor="stock-movement-observations"
          label="Observaciones"
        >
          <Textarea
            className="min-h-20 resize-none"
            id="stock-movement-observations"
            maxLength={300}
            onChange={(event) => setObservations(event.target.value)}
            placeholder="Nota opcional para el historial"
            rows={2}
            value={observations}
          />
        </Field>
      </div>

      <div className="grid gap-2 border-t border-[color:var(--border)] pt-4 sm:grid-cols-2">
        <Button className="w-full" onClick={onCancel} type="button" variant="secondary">
          Cancelar
        </Button>
        <Button className="w-full" disabled={!hasValidQuantity || wouldBeNegative} type="submit">
          Guardar movimiento
        </Button>
      </div>
    </form>
  );
}
