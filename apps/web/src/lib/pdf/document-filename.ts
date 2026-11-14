function filenamePart(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

export function documentFilename(
  prefix: string,
  number: string,
  customer: string | null | undefined,
  date: string | null | undefined,
  variant?: string,
) {
  const dateParts = date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const documentDate = dateParts
    ? `${dateParts[3]}-${dateParts[2]}-${dateParts[1].slice(-2)}`
    : "SIN FECHA";
  const customerName = filenamePart(customer || "").slice(0, 100).trim() || "SIN CLIENTE";
  return [
    prefix, filenamePart(number) || "SIN NUMERO", customerName, documentDate, variant,
  ].filter(Boolean).join("-") + ".pdf";
}
