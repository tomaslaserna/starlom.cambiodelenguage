"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppIcon } from "@/components/ui/app-icon";
import { Button, cn } from "@/components/ui";
import { formatBytes, type BankScope } from "@/lib/bank";
import type { BankListing } from "@/lib/bank-store";

let browserStorageClient: SupabaseClient | null = null;
function getBrowserStorageClient() {
  if (!browserStorageClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("La carga de archivos no está configurada");
    browserStorageClient = createClient(url, key, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }
  return browserStorageClient;
}

type SignedUpload = { uploadId: string; bucket: string; path: string; token: string; contentType: string };

async function jsonFetch(url: string, init: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error || "Ocurrió un error");
  return payload.data;
}

export function BankClient({ personal, shared }: { personal: BankListing; shared: BankListing }) {
  const router = useRouter();
  const [scope, setScope] = useState<BankScope>("shared");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listing = scope === "personal" ? personal : shared;
  const { canWrite, usedBytes, quotaBytes } = listing;
  const usedPct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  const visibleFiles = useMemo(
    () => listing.files.filter((file) => file.folderId === folderId),
    [listing.files, folderId],
  );

  function switchScope(next: BankScope) {
    setScope(next);
    setNewFolder("");
    setFolderId(null);
    setError("");
    setStatus("");
  }

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocurrió un error");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!files.length) return;

    await withBusy(async () => {
      const storage = getBrowserStorageClient();
      for (const [index, file] of files.entries()) {
        setStatus(`Subiendo ${index + 1} de ${files.length}: ${file.name}`);
        const signed = (await jsonFetch("/api/bank/uploads/sign", {
          method: "POST",
          body: JSON.stringify({ scope, folderId, fileName: file.name, mime: file.type, size: file.size }),
        })) as SignedUpload;

        const { error: uploadError } = await storage.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: signed.contentType, upsert: false });
        if (uploadError) throw new Error(uploadError.message || `No se pudo subir ${file.name}`);

        await jsonFetch("/api/bank/files", {
          method: "POST",
          body: JSON.stringify({ uploadId: signed.uploadId }),
        });
      }
    });
  }

  async function createFolder() {
    const name = newFolder.trim();
    if (!name) return;
    await withBusy(async () => {
      await jsonFetch("/api/bank/folders", { method: "POST", body: JSON.stringify({ scope, name }) });
      setNewFolder("");
    });
  }

  async function deleteFolder(id: number, name: string) {
    if (!window.confirm(`¿Borrar la carpeta "${name}" y todos sus archivos?`)) return;
    await withBusy(async () => {
      await jsonFetch(`/api/bank/folders/${id}`, { method: "DELETE" });
      if (folderId === id) setFolderId(null);
    });
  }

  async function deleteFile(id: number, name: string) {
    if (!window.confirm(`¿Borrar "${name}"?`)) return;
    await withBusy(async () => {
      await jsonFetch(`/api/bank/files/${id}`, { method: "DELETE" });
    });
  }

  const folder = listing.folders.find((item) => item.id === folderId);
  const spaceName = scope === "shared" ? "Empresa" : "Mi banco";

  return (
    <div className="grid gap-4 text-slate-900">
      <nav aria-label="Espacios del banco" className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {(["shared", "personal"] as const).map((space) => (
          <button key={space} type="button" disabled={busy} aria-pressed={scope === space}
            className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold", scope === space ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50")}
            onClick={() => switchScope(space)}>
            <AppIcon name={space === "shared" ? "units" : "user"} className="h-4 w-4" />
            {space === "shared" ? "Empresa" : "Mi banco"}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">Carpetas</h2>
          <nav aria-label="Carpetas" className="grid max-h-64 gap-1 overflow-auto lg:max-h-96">
            {[{ id: null, name: "Sin carpeta" }, ...listing.folders].map((item) => (
              <button key={item.id ?? "root"} type="button" disabled={busy} aria-pressed={item.id === folderId}
                className={cn("break-words rounded-lg px-3 py-2 text-left text-sm", item.id === folderId ? "bg-blue-50 font-bold text-blue-800" : "text-slate-700 hover:bg-slate-50")}
                onClick={() => setFolderId(item.id)}>{item.name}</button>
            ))}
          </nav>
          {canWrite && <details key={scope} className="mt-3 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">Nueva carpeta</summary>
            <form className="mt-2 grid gap-2" onSubmit={(event) => { event.preventDefault(); void createFolder(); }}>
              <label className="grid gap-1 text-xs font-medium">Nombre de la carpeta
                <input className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} />
              </label>
              <Button type="submit" variant="secondary" disabled={busy || !newFolder.trim()}>Crear carpeta</Button>
            </form>
          </details>}
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <p>Almacenamiento de {spaceName}</p>
            <div className="my-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full", usedPct >= 90 ? "bg-amber-600" : "bg-blue-500")} style={{ width: `${usedPct}%` }} /></div>
            {formatBytes(usedBytes)} de {formatBytes(quotaBytes)}
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">{scope === "shared" ? "Empresa · Compartido" : "Mi banco · Privado"}</p>
              <h2 className="mt-1 break-words text-xl font-bold">{folder?.name ?? "Archivos sin carpeta"}</h2>
              <p className="mt-1 text-xs text-slate-600">{visibleFiles.length} {visibleFiles.length === 1 ? "archivo" : "archivos"}{!canWrite && " · Solo lectura"}</p>
            </div>
            {canWrite && <div>
              <Button disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">Subir archivo</Button>
              <input className="hidden" multiple onChange={onFilesSelected} ref={fileInputRef} type="file" />
            </div>}
          </header>
          {status && <p role="status" className="px-5 pt-3 text-sm text-blue-700">{status}</p>}
          {error && <p role="alert" className="px-5 pt-3 text-sm text-red-700">{error}</p>}
          {visibleFiles.length === 0 ? (
            <div className="grid justify-items-center gap-3 px-4 py-10 text-center text-slate-500">
              <AppIcon name="invoice" className="h-8 w-8" />
              <p className="text-sm">{folder ? "Esta carpeta todavía está vacía." : "Todavía no hay archivos sin carpeta."}</p>
            </div>
          ) : <ul className="divide-y divide-slate-100">
            {visibleFiles.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><AppIcon name="invoice" className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <a className="break-words text-sm font-semibold hover:text-blue-700 hover:underline" href={`/api/bank/files/${file.id}`} target="_blank" rel="noreferrer">{file.name}</a>
                    <p className="text-xs text-slate-500">{formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString("es-AR")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <a className="inline-flex items-center gap-1 py-2 text-blue-700 hover:underline" href={`/api/bank/files/${file.id}?download=1`} aria-label={`Descargar ${file.name}`}><AppIcon name="download" className="h-4 w-4" />Descargar</a>
                  {canWrite && <button type="button" disabled={busy} className="py-2 text-slate-500 hover:text-red-700" aria-label={`Borrar ${file.name}`} onClick={() => deleteFile(file.id, file.name)}>Borrar</button>}
                </div>
              </li>
            ))}
          </ul>}
          {folder && canWrite && <footer className="border-t border-slate-100 px-5 py-3 text-right">
            <button type="button" className="text-xs font-medium text-slate-500 hover:text-red-700" disabled={busy} onClick={() => deleteFolder(folder.id, folder.name)}>Borrar carpeta</button>
          </footer>}
        </section>
      </div>
    </div>
  );
}
