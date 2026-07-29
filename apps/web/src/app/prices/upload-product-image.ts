import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
function getBrowserClient() {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("La carga de imágenes no está configurada");
    browserClient = createClient(url, key, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
  }
  return browserClient;
}

// Signs, uploads the file straight to Supabase and returns the object path to
// reference from the product. Shared by the new-product form and the inline
// image cell.
export async function uploadProductImage(file: File): Promise<string> {
  const response = await fetch("/api/products/image/sign", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mime: file.type, size: file.size }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { bucket: string; path: string; token: string; contentType: string };
    error?: string;
  };
  if (!response.ok || !payload.data) throw new Error(payload.error || "No se pudo preparar la imagen");

  const { bucket, path, token, contentType } = payload.data;
  const { error } = await getBrowserClient()
    .storage.from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType, upsert: false });
  if (error) throw new Error(error.message || "No se pudo subir la imagen");
  return path;
}
