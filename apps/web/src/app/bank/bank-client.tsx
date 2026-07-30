"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  const [scope, setScope] = useState<BankScope>("personal");
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabButton active={scope === "personal"} onClick={() => switchScope("personal")}>
          Mi banco
        </TabButton>
        <TabButton active={scope === "shared"} onClick={() => switchScope("shared")}>
          Empresa
        </TabButton>
      </div>

      <div className="rounded-[10px] border border-[#d9e2ef] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="erp-text-caption font-semibold text-[#64748b]">
              {scope === "personal" ? "Espacio personal (privado)" : "Espacio de la empresa (compartido)"}
            </p>
            <p className="text-sm font-bold text-[#0f172a]">
              {formatBytes(usedBytes)} de {formatBytes(quotaBytes)} usados
            </p>
          </div>
          <div className="min-w-[180px] flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef2f8]">
              <div
                className={cn("h-full rounded-full", usedPct >= 90 ? "bg-[#dc2626]" : "bg-[#2563eb]")}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        </div>

        {!canWrite ? (
          <p className="erp-text-caption mt-3 rounded-md bg-[#f8fafc] px-3 py-2 text-[#64748b]">
            Solo el jefe o un administrador puede subir o borrar archivos en el banco de la empresa. Podés ver y descargar.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">
              Subir archivo
            </Button>
            <input className="hidden" multiple onChange={onFilesSelected} ref={fileInputRef} type="file" />
            <div className="flex items-end gap-2">
              <label className="grid gap-1">
                <span className="erp-text-caption font-semibold text-[#64748b]">Nueva carpeta</span>
                <input
                  className="h-10 rounded-[9px] border border-[#d9e2ef] px-3 text-sm"
                  onChange={(event) => setNewFolder(event.target.value)}
                  placeholder="Nombre"
                  value={newFolder}
                />
              </label>
              <Button disabled={busy || !newFolder.trim()} onClick={createFolder} type="button" variant="secondary">
                Crear
              </Button>
            </div>
          </div>
        )}

        {status ? <p className="erp-text-caption mt-2 text-[#2563eb]">{status}</p> : null}
        {error ? <p className="erp-text-caption mt-2 font-semibold text-[#dc2626]">{error}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FolderChip active={folderId === null} onClick={() => setFolderId(null)}>
          Raíz
        </FolderChip>
        {listing.folders.map((folder) => (
          <FolderChip active={folderId === folder.id} key={folder.id} onClick={() => setFolderId(folder.id)}>
            <span className="flex items-center gap-1.5">
              📁 {folder.name}
              {canWrite ? (
                <span
                  aria-label={`Borrar carpeta ${folder.name}`}
                  className="ml-1 rounded px-1 text-[#94a3b8] hover:bg-[#fee2e2] hover:text-[#dc2626]"
                  onClick={(event) => {
                    event.stopPropagation();
                    void deleteFolder(folder.id, folder.name);
                  }}
                  role="button"
                >
                  ✕
                </span>
              ) : null}
            </span>
          </FolderChip>
        ))}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[#d9e2ef] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        {visibleFiles.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#64748b]">
            {folderId === null ? "No hay archivos en la raíz." : "Esta carpeta está vacía."}
            {canWrite ? " Usá “Subir archivo” para agregar." : ""}
          </p>
        ) : (
          <ul className="divide-y divide-[#eef2f8]">
            {visibleFiles.map((file) => (
              <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-[#f8fbff]" key={file.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#172033]">{file.name}</p>
                  <p className="erp-text-caption text-[#64748b]">
                    {formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    className="rounded-md bg-[#eaf2ff] px-2.5 py-1 text-xs font-bold text-[#2563eb] hover:bg-[#dbe8ff]"
                    href={`/api/bank/files/${file.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver
                  </a>
                  <a
                    className="rounded-md bg-[#f1f5f9] px-2.5 py-1 text-xs font-bold text-[#334155] hover:bg-[#e2e8f0]"
                    href={`/api/bank/files/${file.id}?download=1`}
                  >
                    Descargar
                  </a>
                  {canWrite ? (
                    <button
                      className="rounded-md px-2.5 py-1 text-xs font-bold text-[#dc2626] hover:bg-[#fee2e2]"
                      disabled={busy}
                      onClick={() => deleteFile(file.id, file.name)}
                      type="button"
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={cn(
        "h-10 rounded-[9px] border px-4 text-sm font-bold transition-colors",
        active
          ? "border-[#2563eb] bg-[#2563eb] text-white"
          : "border-[#d9e2ef] bg-white text-[#334155] hover:border-[#2563eb]",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function FolderChip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={cn(
        "h-9 rounded-full border px-3 text-xs font-bold transition-colors",
        active ? "border-[#2563eb] bg-[#eaf2ff] text-[#2563eb]" : "border-[#d9e2ef] bg-white text-[#334155] hover:border-[#2563eb]",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
