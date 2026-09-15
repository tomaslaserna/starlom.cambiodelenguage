"use client";

import { useState } from "react";

type Quote = { id: string; client_id: string; number: string; issue_date: string; expiration_date: string; total: string; status: string };
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function PortalQuotes({ accessToken, quotes, onChanged }: {
  accessToken: string;
  quotes: Quote[];
  onChanged: (value: unknown) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function openPdf(id: string) {
    const response = await fetch(`/api/portal/documents/quotes/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) { setError("No pudimos abrir el presupuesto"); return; }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.target = "_blank"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function decide(id: string, action: "approve" | "reject") {
    const note = (notes[id] ?? "").trim();
    if (action === "reject" && !note) {
      setError("Contanos qué querés cambiar o por qué rechazás el presupuesto.");
      return;
    }
    setBusy(id); setError("");
    try {
      const response = await fetch(`/api/portal/quotes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos actualizar el presupuesto");
      const refreshed = await fetch("/api/portal/summary", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const refreshedPayload = await refreshed.json();
      if (refreshed.ok) onChanged(refreshedPayload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos actualizar el presupuesto");
    } finally { setBusy(""); }
  }

  return <section className="scroll-mt-5 overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white shadow-sm" id="presupuestos">
    <div className="border-b border-[#e4ebf3] px-5 py-4"><h2 className="text-xl font-black">Presupuestos vigentes</h2><p className="mt-1 text-sm text-[#64748b]">Podés aprobarlos o pedir cambios mientras estén vigentes. Al vencer dejan de mostrarse.</p></div>
    {error ? <p className="m-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
    {quotes.length ? <div className="divide-y divide-[#edf1f6]">{quotes.map((quote) => <article className="grid gap-4 p-5" key={quote.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-lg">{quote.number}</strong><p className="text-sm text-[#64748b]">Emitido {quote.issue_date} · vence {quote.expiration_date}</p></div><strong className="text-xl">{money.format(Number(quote.total))}</strong></div>
      <div className="flex flex-wrap gap-3">
        <button className="min-h-10 rounded-lg border border-[#bcd5ef] px-4 text-sm font-bold text-[#075ac7]" onClick={() => openPdf(quote.id)} type="button">Ver PDF</button>
        {quote.status === "pendiente" ? <><button className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy === quote.id} onClick={() => decide(quote.id, "approve")} type="button">Aprobar presupuesto</button><input className="min-h-10 min-w-64 flex-1 rounded-lg border border-[#cbd8e8] px-3 text-sm" onChange={(event) => setNotes((current) => ({ ...current, [quote.id]: event.target.value }))} placeholder="Qué querés cambiar o motivo del rechazo" value={notes[quote.id] ?? ""} /><button className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-bold text-red-700 disabled:opacity-50" disabled={busy === quote.id} onClick={() => decide(quote.id, "reject")} type="button">Rechazar / pedir cambios</button></> : <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold">{quote.status === "aceptada" ? "Aprobado" : "Rechazado"}</span>}
      </div>
    </article>)}</div> : <p className="p-5 text-[#64748b]">No hay presupuestos vigentes para esta sucursal.</p>}
  </section>;
}
