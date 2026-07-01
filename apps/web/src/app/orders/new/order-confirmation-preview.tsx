"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import {
  buildWhatsappConfirmation,
  normalizePhoneForWhatsapp,
  type ConfirmationLine,
} from "@/lib/order-confirmation";

type OrderConfirmationPreviewProps = {
  businessName: string;
  phone: string;
  address: string;
  lines: ConfirmationLine[];
  deliveryDate: string;
  ready: boolean;
};

export function OrderConfirmationPreview({
  businessName,
  phone,
  address,
  lines,
  deliveryDate,
  ready,
}: OrderConfirmationPreviewProps) {
  const [offerText, setOfferText] = useState("");
  const [copied, setCopied] = useState(false);

  const message = useMemo(
    () =>
      buildWhatsappConfirmation({
        businessName,
        lines,
        deliveryLocation: address,
        deliveryDate,
        offerText,
      }),
    [businessName, lines, address, deliveryDate, offerText],
  );

  const waPhone = useMemo(() => normalizePhoneForWhatsapp(phone), [phone]);
  const waUrl = ready && waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}` : null;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-white p-4">
      <h3 className="erp-text-body font-black">Confirmación para WhatsApp</h3>

      <Field htmlFor="order-offer" label="Oferta (opcional)">
        <Input
          id="order-offer"
          placeholder="Ej: llevando 2 bobinas, la 2da 50% OFF"
          value={offerText}
          onChange={(event) => setOfferText(event.target.value)}
        />
      </Field>

      {ready ? (
        <pre className="erp-text-body-sm max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 font-sans">
          {message}
        </pre>
      ) : (
        <p className="erp-text-body-sm rounded-md border border-dashed border-[color:var(--border)] p-3 text-[color:var(--muted)]">
          Seleccioná un cliente y agregá productos para ver la confirmación.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={!ready} type="button" variant="secondary" onClick={copyMessage}>
          {copied ? "Copiado ✓" : "📋 Copiar"}
        </Button>
        {waUrl ? (
          <a
            className="inline-flex min-h-10 items-center rounded-[10px] bg-[#25D366] px-4 font-semibold text-white hover:brightness-95"
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            🟢 Abrir en WhatsApp
          </a>
        ) : (
          <Button
            disabled
            title={ready ? "Cliente sin teléfono válido" : "Completá cliente y productos"}
            type="button"
            variant="secondary"
          >
            🟢 Abrir en WhatsApp
          </Button>
        )}
      </div>
    </div>
  );
}
