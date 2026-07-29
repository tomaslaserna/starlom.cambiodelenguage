"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadProductImage } from "@/app/prices/upload-product-image";

export function ProductImageCell({
  productId,
  imageUrl,
  canEdit,
}: {
  productId: string;
  imageUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setError(false);
    try {
      const path = await uploadProductImage(file);
      const response = await fetch(`/api/products/${productId}/image`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(false);
    try {
      await fetch(`/api/products/${productId}/image`, { method: "DELETE" });
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-10 w-10 rounded-md object-cover ring-1 ring-inset ring-[#e2e8f0]"
          src={imageUrl}
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f1f5f9] text-xs text-[#94a3b8] ring-1 ring-inset ring-[#e2e8f0]">
          —
        </div>
      )}
      {canEdit ? (
        <div className="flex flex-col items-start gap-0.5">
          <button
            className="text-xs font-bold text-[#2563eb] hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {busy ? "Subiendo…" : imageUrl ? "Cambiar" : "Subir"}
          </button>
          {imageUrl && !busy ? (
            <button className="text-xs text-[#dc2626] hover:underline" onClick={onRemove} type="button">
              Quitar
            </button>
          ) : null}
          {error ? <span className="text-xs text-[#dc2626]">Error</span> : null}
          <input accept="image/*" className="hidden" onChange={onSelect} ref={inputRef} type="file" />
        </div>
      ) : null}
    </div>
  );
}
