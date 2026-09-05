"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SourceRow = { productId: string; productName: string; existing: boolean };

export function ImportButtons({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const pending = sources.filter((source) => !source.existing);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function importOne(productId: string) {
    const response = await fetch("/api/products/image/import", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "No se pudo importar la imagen");
  }

  async function importAll() {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      for (let index = 0; index < pending.length; index += 1) {
        await importOne(pending[index].productId);
        setProgress(index + 1);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar la importación");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="inline-flex h-10 items-center justify-center rounded-lg bg-[#145bd7] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={busy || pending.length === 0}
        onClick={importAll}
        type="button"
      >
        {busy ? `Importando ${progress}/${pending.length}…` : `Importar ${pending.length} verificadas`}
      </button>
      {error ? <span className="text-sm font-semibold text-[#dc2626]">{error}</span> : null}
      {!error && pending.length === 0 ? (
        <span className="text-sm font-semibold text-[#15803d]">La tanda ya está cargada.</span>
      ) : null}
    </div>
  );
}
