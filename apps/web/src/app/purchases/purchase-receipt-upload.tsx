"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

type PurchaseReceiptUploadProps = {
  purchaseId: string;
};

export function PurchaseReceiptUpload({ purchaseId }: PurchaseReceiptUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <input
        ref={inputRef}
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label={`Seleccionar y subir recibo de compra ${purchaseId}`}
        className="sr-only"
        name="foto"
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        suppressHydrationWarning
        type="file"
      />
      <Button
        aria-label={`Subir recibo de compra ${purchaseId}`}
        className="w-full"
        isLoading={pending}
        loadingLabel="Subiendo recibo"
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="secondary"
      >
        Subir recibo
      </Button>
    </>
  );
}
