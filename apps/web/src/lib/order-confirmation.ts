export type ConfirmationLine = {
  quantity: number;
  name: string;
};

export type IvaRate = 0 | 21 | 10.5;

export type ConfirmationPricedLine = {
  quantity: number;
  name: string;
  unitPrice: number;
  subtotal: number;
};

export type ConfirmationInput = {
  businessName: string;
  lines: ConfirmationLine[];
  deliveryLocation: string;
  deliveryDate: string; // YYYY-MM-DD
  offerText?: string;
  showPrices?: boolean;
  pricedLines?: ConfirmationPricedLine[];
  ivaRate?: IvaRate;
};

const DAYS_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function formatConfirmationQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

export function ivaAmount(net: number, rate: IvaRate): number {
  return Math.round((net * (rate / 100) + Number.EPSILON) * 100) / 100;
}

export function formatConfirmationMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `$${safe.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDeliveryDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const dayName = DAYS_ES[date.getDay()];
  return `${day}.${month}.${year.slice(2)} (${dayName})`;
}

// Asume Argentina: antepone el codigo de pais 54 cuando falta.
export function normalizePhoneForWhatsapp(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const national = digits.startsWith("54") ? digits.slice(2) : digits;
  if (national.length < 10) return null;
  return `54${national}`;
}

export function buildWhatsappConfirmation(input: ConfirmationInput): string {
  const priced = input.pricedLines ?? [];
  const showPrices = Boolean(input.showPrices && priced.length > 0);

  const items = showPrices
    ? priced
        .map(
          (line) =>
            `• ${formatConfirmationQuantity(line.quantity)} x ${line.name} — ${formatConfirmationMoney(line.unitPrice)} (subtotal ${formatConfirmationMoney(line.subtotal)})`,
        )
        .join("\n")
    : input.lines
        .map((line) => `• ${formatConfirmationQuantity(line.quantity)} x ${line.name}`)
        .join("\n");

  const parts = [
    "*CONFIRMACIÓN DE TU PEDIDO – STARLIM* ✅",
    "",
    `*${input.businessName}*, te confirmamos antes de preparar:`,
    "",
    "*Pedido:*",
    items,
  ];

  if (showPrices) {
    const net = priced.reduce((sum, line) => sum + line.subtotal, 0);
    const rate = input.ivaRate ?? 0;
    const iva = ivaAmount(net, rate);
    parts.push("", `*Subtotal:* ${formatConfirmationMoney(net)}`);
    if (rate > 0) {
      parts.push(`*IVA (${rate}%):* ${formatConfirmationMoney(iva)}`);
    }
    parts.push(`*Total:* ${formatConfirmationMoney(net + iva)}`);
  }

  parts.push(
    "",
    `🚚 *Entrega:* ${input.deliveryLocation}`,
    `📅 *Entrega estimada:* ${formatDeliveryDate(input.deliveryDate)}`,
    "",
    "¿Está todo correcto? Respondé *SÍ* para confirmar, o decinos qué corregir.",
  );

  const offer = (input.offerText ?? "").trim();
  if (offer) {
    parts.push("", `💡 ${offer}`);
  }

  return parts.join("\n");
}
