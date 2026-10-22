"use client";

import { useEffect, useRef, useState } from "react";
import type { CustomerStatement } from "@/lib/customer-accounts";
import { statementMovementPresentation } from "@/lib/customer-statement-presentation";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PortalHistoryScope } from "@/lib/portal-history";

type AccountData = {
  clientId: string; customerName: string; currentBalance: number; statement: CustomerStatement;
  lastZeroDate: string | null; hiddenCount: number; completeHistory: boolean;
  historyScope: PortalHistoryScope;
};

export function PortalAccountStatement({ clientId, accessToken, updatedAt, onHistoryScope }: { clientId: string; accessToken: string; updatedAt: string; onHistoryScope?: (scope: PortalHistoryScope) => void }) {
  const [completeHistory, setCompleteHistory] = useState(false);
  const [result, setResult] = useState<{ key: string; data?: AccountData; error?: string } | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  const key = `${clientId}:${completeHistory}:${updatedAt}`;
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  const loading = !data && !error;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/portal/accounts/${encodeURIComponent(clientId)}${completeHistory ? "?history=completo" : ""}`, {
      headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos cargar tu cuenta corriente");
      if (!controller.signal.aborted) {
        setResult({ key, data: payload.data as AccountData });
        if (payload.data.historyScope) onHistoryScope?.(payload.data.historyScope);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : "No pudimos cargar tu cuenta corriente" });
    });
    return () => controller.abort();
  }, [clientId, accessToken, completeHistory, key, onHistoryScope]);

  useEffect(() => () => { downloadRequest.current?.abort(); }, []);

  async function download(full: boolean) {
    if (downloadRequest.current) return;
    const controller = new AbortController(); downloadRequest.current = controller;
    setDownloading(true); setDownloadError("");
    try {
      const response = await fetch(`/api/portal/documents/accounts/${encodeURIComponent(clientId)}${full ? "?history=completo" : ""}`, {
        headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "No pudimos descargar el estado de cuenta");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `estado_cuenta_${clientId}_${full ? "completo" : "actual"}.pdf`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      if (!controller.signal.aborted) setDownloadError(cause instanceof Error ? cause.message : "No pudimos descargar el PDF");
    } finally {
      if (!controller.signal.aborted) setDownloading(false);
      downloadRequest.current = null;
    }
  }

  const buttonClass = "min-h-10 rounded-xl border border-[#bcd5ef] px-4 py-2 text-sm font-bold text-[#075ac7] hover:bg-[#eef6ff] disabled:opacity-50";
  return <section id="cuenta-corriente" aria-label="Mi cuenta corriente" className="scroll-mt-20 overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><h2 className="text-xl font-black">Cuenta corriente</h2><p className="mt-1 text-sm text-[#64748b]">{completeHistory ? "Historial completo de esta sucursal" : "Movimientos desde el último saldo cero"}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} type="button" onClick={() => setCompleteHistory((value) => !value)}>{completeHistory ? "Último período" : "Historial completo"}</button>
        <button className={buttonClass} type="button" disabled={downloading || !data} onClick={() => void download(completeHistory)}>{downloading ? "Descargando…" : "Descargar PDF"}</button>
        {!completeHistory ? <button className={buttonClass} type="button" disabled={downloading || !data} onClick={() => void download(true)}>PDF historial completo</button> : null}
      </div>
    </header>
    {loading ? <p role="status" className="px-5 pb-5 text-sm text-[#64748b]">Cargando movimientos…</p> : null}
    {error || downloadError ? <p role="alert" className="mx-5 mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || downloadError}</p> : null}
    {data ? <>
      <div className="mx-5 mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-[#f3f7fc] p-4">
        <div><p className="text-xs text-[#64748b]">{data.currentBalance < 0 ? "Saldo a tu favor" : data.currentBalance === 0 ? "Cuenta al día" : "Saldo actual a pagar"}</p><strong className={`mt-1 block text-2xl font-black tabular-nums ${data.currentBalance < 0 ? "text-emerald-700" : ""}`}>{formatCurrency(Math.abs(data.currentBalance))}</strong></div>
        <p className="text-xs text-[#64748b]">{data.statement.lines.length} movimientos{!completeHistory && data.lastZeroDate ? ` · Último cierre: ${formatDate(data.lastZeroDate)}` : ""}</p>
      </div>
      {!completeHistory && data.hiddenCount > 0 ? <p className="px-5 pb-4 text-xs text-[#64748b]">{data.hiddenCount} movimientos anteriores disponibles en «Historial completo».</p> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm" aria-label="Estado de cuenta de mi sucursal">
        <thead className="bg-[#f3f7fc] text-xs text-[#64748b]"><tr><th scope="col" className="px-5 py-3 text-left">Fecha</th><th scope="col" className="px-5 py-3 text-left">Movimiento</th><th scope="col" className="px-5 py-3 text-right">Importe</th><th scope="col" className="px-5 py-3 text-right">Saldo</th></tr></thead>
        <tbody className="divide-y divide-[#edf1f6]">
          <tr className="text-[#64748b]"><td className="px-5 py-3">—</td><th scope="row" className="px-5 py-3 text-left font-medium">Saldo anterior</th><td className="px-5 py-3 text-right">—</td><td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{formatCurrency(data.statement.openingBalance)}</td></tr>
          {data.statement.lines.map((item) => {
            const display = statementMovementPresentation(item);
            return <tr key={item.id}>
              <td className="whitespace-nowrap px-5 py-4 text-xs text-[#64748b]">{formatDate(item.date)}</td>
              <td className="px-5 py-4"><span className="font-bold">{display.title}</span><details className="mt-1 text-xs text-[#64748b]"><summary className="cursor-pointer">Ver detalle</summary><p className="mt-2 max-w-lg whitespace-pre-wrap break-words">{item.description}</p></details></td>
              <td className={`whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums ${display.amount < 0 ? "text-emerald-700" : ""}`}>{display.amount < 0 ? "- " : display.amount > 0 ? "+ " : ""}{formatCurrency(Math.abs(display.amount))}</td>
              <td className="whitespace-nowrap px-5 py-4 text-right font-bold tabular-nums">{formatCurrency(item.balance)}{item.balance < 0 ? <span className="block text-xs font-normal text-emerald-700">a favor</span> : null}</td>
            </tr>;
          })}
          {!data.statement.lines.length ? <tr><td colSpan={4} className="px-5 py-7 text-center text-[#64748b]">{data.currentBalance === 0 ? "Cuenta al día. Podés consultar el historial completo." : "No hay movimientos para mostrar."}</td></tr> : null}
        </tbody>
        <tfoot className="border-t border-[#dbe5f1] bg-[#f3f7fc]"><tr><th colSpan={3} scope="row" className="px-5 py-4 text-left">Saldo final</th><td className="whitespace-nowrap px-5 py-4 text-right text-lg font-black tabular-nums">{formatCurrency(data.statement.finalBalance)}</td></tr></tfoot>
      </table></div>
    </> : null}
  </section>;
}
