"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { StockImportPreview } from "@/lib/inventory";

type ApiPayload<T> = { ok: true; data: T } | { ok: false; error: string; requestId?: string };

function sourceRows(preview: StockImportPreview) {
  return preview.rows.map(({ rowNumber, productId, code, mode, quantity, reason }) => ({
    rowNumber,
    productId,
    code,
    mode,
    quantity,
    reason,
  }));
}

export function StockBulkImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [defaultMode, setDefaultMode] = useState("");
  const [reason, setReason] = useState("Carga masiva de stock");
  const [preview, setPreview] = useState<StockImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"preview" | "commit" | "">("");

  async function parseResponse<T>(response: Response) {
    const payload = (await response.json().catch(() => null)) as ApiPayload<T> | null;
    if (!response.ok || !payload?.ok) {
      const detail = payload && !payload.ok && payload.requestId ? ` (referencia ${payload.requestId})` : "";
      throw new Error(`${payload && !payload.ok ? payload.error : "No se pudo procesar la carga"}${detail}`);
    }
    return payload.data;
  }

  async function validateImport() {
    setBusy("preview");
    setMessage("");
    setPreview(null);
    try {
      const form = new FormData();
      if (file) form.set("file", file);
      if (text.trim()) form.set("text", text);
      form.set("defaultMode", defaultMode);
      form.set("reason", reason);
      const response = await fetch("/api/stock/import/preview", { method: "POST", body: form });
      const data = await parseResponse<StockImportPreview>(response);
      setPreview(data);
      setMessage(data.errors ? "Hay filas para corregir antes de aplicar." : "Validacion completa. Revisa el detalle y aplica el lote.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo validar la carga");
    } finally {
      setBusy("");
    }
  }

  async function commitImport() {
    if (!preview || preview.errors) return;
    setBusy("commit");
    setMessage("");
    try {
      const response = await fetch("/api/stock/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId: preview.batchId, rows: sourceRows(preview) }),
      });
      const data = await parseResponse<{ inserted: number; duplicated: number; unchanged: number; total: number }>(response);
      setMessage(
        `Carga aplicada: ${data.inserted} movimientos, ${data.unchanged} sin cambios, ${data.duplicated} ya procesados.`,
      );
      setPreview(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo aplicar la carga");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Instructivo de carga</CardTitle>
          <CardDescription>La validacion no modifica stock. El lote se aplica recien con el segundo boton.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Identifica cada producto con <strong>id_producto</strong> o con un SKU unico en <strong>codigo</strong>.</li>
            <li>Indica <strong>tipo</strong>: entrada, salida o exacto. Tambien puedes elegir un tipo comun abajo.</li>
            <li>Usa una cantidad entera positiva; en tipo exacto se admite cero.</li>
            <li>Valida, corrige todas las filas marcadas y recien entonces aplica el lote.</li>
          </ol>
          <div className="rounded-[var(--radius-md)] bg-[color:var(--panel-subtle)] p-3 font-mono text-xs">
            CSV: id_producto,codigo,tipo,cantidad,motivo<br />
            JSON: {`[{"id_producto":"uuid","tipo":"entrada","cantidad":10,"motivo":"Compra"}]`}
          </div>
          <a className="font-semibold text-[color:var(--accent)] underline" download href="/templates/stock-import-template.csv">
            Descargar plantilla CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archivo o JSON</CardTitle>
          <CardDescription>Acepta CSV, JSON como array y JSON con la forma {`{"items": [...]}`}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field htmlFor="stock-import-file" label="Archivo CSV o JSON">
              <Input
                accept=".csv,.json,text/csv,application/json"
                id="stock-import-file"
                type="file"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
            </Field>
            <Field htmlFor="stock-import-default-mode" label="Tipo comun (opcional)">
              <Select
                id="stock-import-default-mode"
                value={defaultMode}
                onChange={(event) => {
                  setDefaultMode(event.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Usar el tipo de cada fila</option>
                <option value="entrada">Todas son entradas</option>
                <option value="salida">Todas son salidas</option>
                <option value="exacto">Todas fijan stock exacto</option>
              </Select>
            </Field>
          </div>
          <Field htmlFor="stock-import-text" label="O pega CSV / JSON">
            <Textarea
              id="stock-import-text"
              placeholder='[{"id_producto":"...","tipo":"exacto","cantidad":25,"motivo":"Recuento"}]'
              rows={7}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <Field htmlFor="stock-import-reason" label="Motivo por defecto" required>
            <Input
              id="stock-import-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={Boolean(busy) || (!file && !text.trim()) || !reason.trim()} type="button" onClick={validateImport}>
              {busy === "preview" ? "Validando..." : "1. Validar y previsualizar"}
            </Button>
            <Button
              disabled={Boolean(busy) || !preview || preview.errors > 0}
              type="button"
              variant="secondary"
              onClick={commitImport}
            >
              {busy === "commit" ? "Aplicando..." : "2. Aplicar movimientos"}
            </Button>
          </div>
          {message ? (
            <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 text-sm font-semibold" role="status">
              {message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              {preview.ready} movimientos listos, {preview.unchanged} sin cambios y {preview.errors} con errores.
            </CardDescription>
          </CardHeader>
          <DataTable caption="Vista previa de importacion de stock" minWidth="920px" tableLabel="Vista previa stock">
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Fila</DataTableHead>
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Tipo</DataTableHead>
                <DataTableHead align="right">Actual</DataTableHead>
                <DataTableHead align="right">Cambio</DataTableHead>
                <DataTableHead align="right">Final</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {preview.rows.slice(0, 200).map((row) => (
                <DataTableRow key={`${row.rowNumber}-${row.productId || row.code}`}>
                  <DataTableCell>{row.rowNumber}</DataTableCell>
                  <DataTableCell>
                    <div className="font-semibold">{row.productName || row.code || row.productId || "-"}</div>
                    <div className="text-xs text-[color:var(--muted)]">{row.code || row.productId}</div>
                  </DataTableCell>
                  <DataTableCell>{row.mode ?? "-"}</DataTableCell>
                  <DataTableCell align="right">{row.currentStock === null ? "-" : formatNumber(row.currentStock)}</DataTableCell>
                  <DataTableCell align="right">{row.delta === null ? "-" : formatNumber(row.delta)}</DataTableCell>
                  <DataTableCell align="right">{row.targetStock === null ? "-" : formatNumber(row.targetStock)}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge tone={row.status === "error" ? "danger" : row.status === "lista" ? "success" : "neutral"}>
                      {row.status === "error" ? row.errors.join("; ") : row.status === "lista" ? "Lista" : "Sin cambios"}
                    </StatusBadge>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          {preview.rows.length > 200 ? (
            <div className="border-t border-[color:var(--border)] p-3 text-sm text-[color:var(--muted)]">
              Se muestran las primeras 200 de {preview.rows.length} filas. La validacion incluye el lote completo.
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
