export function safeLocalReturnPath(value: unknown) {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) {
    return "/";
  }

  try {
    const url = new URL(path, "https://starlim.local");
    if (url.origin !== "https://starlim.local") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
