import { ApiError, handleApiError, ok } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ApiError(400, "Ubicación inválida");
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`, {
      headers: { "User-Agent": "StarlimStore/1.0 (starlimmsas@gmail.com)", "Accept-Language": "es" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new ApiError(502, "No se pudo obtener la dirección");
    const data = await response.json() as { display_name?: string; address?: Record<string, string> };
    const address = data.address ?? {};
    return ok({ data: {
      address: data.display_name ?? "",
      city: address.city || address.town || address.village || address.municipality || "",
      province: address.state || "",
    } });
  } catch (error) { return handleApiError(error); }
}
