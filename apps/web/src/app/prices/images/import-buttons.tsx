"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SourceRow = { productId?: string; sourceKey?: string; productName: string; existing: boolean; available?: boolean };

export function ImportButtons({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const pending = sources.filter((source) => !source.existing && source.available !== false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  async function importOne(source: SourceRow) {
    const response = await fetch("/api/products/image/import", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ productId: source.productId, sourceKey: source.sourceKey }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "No se pudo importar la imagen");
  }

  async function importAll() {
    setBusy(true);
    setError("");
    setSummary("");
    setProgress(0);
    const failures: string[] = [];
    let imported = 0;
    try {
      for (let index = 0; index < pending.length; index += 1) {
        const source = pending[index];
        try {
          await importOne(source);
          imported += 1;
        } catch (caught) {
          const reason = caught instanceof Error ? caught.message : "Error desconocido";
          failures.push(source.productName + ": " + reason);
        }
        setProgress(index + 1);
      }
      if (imported > 0) setSummary(imported + " " + (imported === 1 ? "imagen importada." : "imágenes importadas."));
      if (failures.length > 0) {
        setError(failures.length + " " + (failures.length === 1 ? "imagen no pudo importarse: " : "imágenes no pudieron importarse: ") + failures.join(" · "));
      }
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
      {summary ? <span className="text-sm font-semibold text-[#15803d]">{summary}</span> : null}
      {!error && pending.length === 0 ? (
        <span className="text-sm font-semibold text-[#15803d]">La tanda ya está cargada.</span>
      ) : null}
    </div>
  );
}
