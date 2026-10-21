"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_RECEIPT_ACCEPT, paymentReceiptFileError, type PaymentReceiptReading } from "@/lib/payment-receipt";
import { receiptTaskWithSignal, RECEIPT_READ_CLIENT_TIMEOUT_MS } from "@/lib/payment-receipt-recovery";

export function PaymentReceiptAttachment({ file, onFileChange, onUseReading }: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onUseReading: (reading: PaymentReceiptReading) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState("");
  const [reading, setReading] = useState<PaymentReceiptReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
    return () => { reader.abort(); };
  }, [file]);

  function choose(next: File | null) {
    request.current?.abort(); request.current = null;
    setBusy(false); setReading(null); setMessage(""); setError("");
    if (next) {
      const invalid = paymentReceiptFileError(next);
      if (invalid) { setError(invalid); return; }
    }
    setPreview(""); onFileChange(next);
  }

  const read = useCallback(async () => {
    if (!file || request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), RECEIPT_READ_CLIENT_TIMEOUT_MS);
    setBusy(true); setError(""); setReading(null); setMessage("");
    try {
      const body = new FormData(); body.set("receipt", file);
      const { response, result } = await receiptTaskWithSignal(async () => {
        const response = await fetch("/api/payments/read-receipt", { method: "POST", body, signal: controller.signal });
        const result = await response.json() as { data?: PaymentReceiptReading; error?: string };
        return { response, result };
      }, controller.signal);
      if (request.current !== controller) return;
      if (!response.ok || !result.data) throw new Error(result.error || "No se pudo leer el comprobante");
      setReading(result.data);
      if (Object.values(result.data).every((value) => value === null)) setMessage("No se detectaron datos legibles. Podés completar los campos manualmente.");
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted ? "La lectura demoró demasiado. Podés cargar los datos manualmente." : cause instanceof Error ? cause.message : "No se pudo leer el comprobante");
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, [file]);

  useEffect(() => {
    if (!file || paymentReceiptFileError(file)) return;
    // Deferring lets Strict Mode cancel its first setup before any paid request.
    // A replaced image/remounted form starts a new read, never reuses old results.
    const automaticRead = setTimeout(() => { void read(); }, 0);
    return () => {
      clearTimeout(automaticRead);
      request.current?.abort(); request.current = null;
    };
  }, [file, read]);

  return <section className="mt-5 rounded-xl border border-dashed border-blue-200 bg-blue-50/25 p-4" aria-labelledby={`${id}-title`}
    onPaste={(event) => {
      const image = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
      if (image) { event.preventDefault(); event.stopPropagation(); choose(image); }
    }}>
    <h4 id={`${id}-title`} className="text-sm font-semibold">Comprobante de transferencia</h4>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">Pegá la captura con Ctrl+V o adjuntala: la IA la lee automáticamente. Después revisás y elegís si usar los datos. Con un comprobante, el número de operación es opcional.</p>
    <input ref={input} type="file" accept={PAYMENT_RECEIPT_ACCEPT} className="sr-only" aria-label="Adjuntar comprobante" onChange={(event) => { choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
    <div tabIndex={0} role="group" aria-label="Pegar imagen del comprobante con Ctrl+V" className="mt-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()}>{file ? "Cambiar imagen" : "Adjuntar imagen"}</Button>
        {file ? <><Button type="button" variant="secondary" size="sm" onClick={() => choose(null)}>Quitar</Button><Button type="button" size="sm" disabled={busy} onClick={read}>{busy ? "Leyendo…" : error ? "Reintentar lectura" : "Volver a leer"}</Button></> : <span className="text-[11px] text-slate-400">JPG, PNG o WEBP · hasta 3 MB</span>}</div>
      {file ? <p className="mt-2 break-all text-[11px] text-slate-500">{file.name} · Se guardará junto al pago.</p> : null}
      {/* Native image is intentional: this is a local, non-public data URL preview. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {file && preview ? <img src={preview} alt="Comprobante adjunto para revisar" className="mt-3 max-h-52 max-w-full rounded-lg border border-slate-200 object-contain" /> : null}
    </div>
    {reading && Object.values(reading).some((value) => value !== null) ? <div className="mt-4 rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-xs font-semibold">Datos detectados · revisalos con el comprobante</p>
      <dl className="mt-2 space-y-1 text-xs text-slate-600"><div>Importe: {reading.amount === null ? "No legible" : formatCurrency(reading.amount)}</div><div>Fecha: {reading.date === null ? "No legible" : formatDate(reading.date)}</div><div className="break-all">Operación: {reading.operation || "No legible"}</div></dl>
      <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => { onUseReading(reading); setReading(null); setMessage("Datos completados. Revisá importe, fecha, cuenta de destino y remitos antes de registrar."); }}>Usar estos datos</Button>
    </div> : null}
    {message ? <p role="status" className="mt-3 text-xs text-blue-800">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p> : null}
    <p className="mt-3 text-[10px] leading-relaxed text-slate-400">La lectura envía la imagen al servicio de IA del sistema. No verifica la acreditación bancaria ni registra el pago: siempre confirmás vos.</p>
  </section>;
}
