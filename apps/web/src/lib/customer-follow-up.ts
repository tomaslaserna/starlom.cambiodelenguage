import { classifyChurn, customerMetrics } from "@/lib/customer-rhythm";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { localDateIso } from "@/lib/timezone";

function dayStart(date: Date) {
  return Date.parse(`${localDateIso(date)}T00:00:00-03:00`);
}

export async function getCustomerFollowUp(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    nombre_cliente: string;
    telefono: string;
    vendedor: string;
    fecha: string | null;
  }>(
    companyId,
    `
      SELECT c.id::text AS id, c.display_name AS nombre_cliente, COALESCE(c.phone,'') AS telefono,
             COALESCE(c.seller_name,'') AS vendedor, d.fecha::text
      FROM clients c
      LEFT JOIN (
        SELECT DISTINCT empresa_id, client_id, sale_date AS fecha
        FROM sales
        WHERE empresa_id = $1
          AND ${normalizedOrderStatusSql("sales")} = 'entregado'
      ) d ON d.empresa_id = c.empresa_id AND d.client_id = c.id
      WHERE c.empresa_id = $1
      ORDER BY c.display_name ASC, c.id ASC, d.fecha ASC
    `,
    [companyId],
  );

  const customers = new Map<
    string,
    { id: string; name: string; phone: string; seller: string; timestamps: number[] }
  >();
  for (const row of result.rows) {
    const current =
      customers.get(row.id) ?? {
        id: row.id,
        name: row.nombre_cliente,
        phone: row.telefono,
        seller: row.vendedor,
        timestamps: [],
      };
    if (row.fecha) current.timestamps.push(dayStart(new Date(row.fecha)));
    customers.set(row.id, current);
  }

  const today = dayStart(new Date());
  const groups: Record<string, unknown[]> = {
    al_dia: [],
    contactar: [],
    riesgo: [],
    perdido: [],
    sin_historial: [],
  };
  const sellers = new Set<string>();

  for (const customer of customers.values()) {
    const timestamps = [...new Set(customer.timestamps)].sort((a, b) => a - b);
    const purchases = timestamps.length;
    if (customer.seller) sellers.add(customer.seller);
    const base = {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      seller: customer.seller,
      purchases,
      intervals: Math.max(0, purchases - 1),
      lastPurchase: purchases ? new Date(timestamps[purchases - 1]).toISOString().slice(0, 10) : null,
    };

    if (purchases < 2) {
      groups.sin_historial.push({
        ...base,
        reason: purchases === 0 ? "Sin compras entregadas" : "Falta una compra mas",
      });
      continue;
    }

    const metrics = customerMetrics(timestamps);
    const last = timestamps[purchases - 1];
    const daysSince = Math.floor((today - last) / 86_400_000);
    const ratio = metrics.average > 0 ? daysSince / metrics.average : 0;
    const expectedNext = new Date(last + metrics.average * 86_400_000).toISOString().slice(0, 10);
    const row = {
      ...base,
      averageDays: metrics.average,
      deviationDays: metrics.deviation,
      intervals: metrics.intervals,
      daysSinceLastPurchase: daysSince,
      delayDays: Math.round(daysSince - metrics.average),
      expectedNextPurchase: expectedNext,
      ratio,
    };

    if (ratio < 0.85) groups.al_dia.push(row);
    else if (ratio <= 1.25) groups.contactar.push(row);
    else if (ratio <= 2) groups.riesgo.push(row);
    else groups.perdido.push(row);
  }

  for (const key of ["contactar", "riesgo", "perdido"]) {
    groups[key].sort((a, b) => {
      const left = a as { ratio?: number; delayDays?: number };
      const right = b as { ratio?: number; delayDays?: number };
      return (right.delayDays ?? right.ratio ?? 0) - (left.delayDays ?? left.ratio ?? 0);
    });
  }

  return {
    groups,
    sellers: [...sellers].sort((a, b) => a.localeCompare(b)),
    counts: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
  };
}

export type ChurnEntry = { customerId: string; customerName: string; seller: string; date: string };

// Altas (primera compra en el período) y bajas (última + 2×ritmo cae en el período)
// de clientes, sobre ventas canónicas entregadas. Reusa la clasificación de ritmo.
export async function getCustomerChurn(
  companyId: number,
  bounds: { currentStart: string; nextStart: string },
): Promise<{ altas: ChurnEntry[]; bajas: ChurnEntry[]; counts: { altas: number; bajas: number; net: number } }> {
  const result = await queryWithCompanyContext<{
    id: string;
    nombre_cliente: string;
    vendedor: string;
    fecha: string | null;
  }>(
    companyId,
    `
      SELECT c.id::text AS id, c.display_name AS nombre_cliente,
             COALESCE(c.seller_name,'') AS vendedor, d.fecha::text
      FROM clients c
      LEFT JOIN (
        SELECT DISTINCT empresa_id, client_id, sale_date AS fecha
        FROM sales
        WHERE empresa_id = $1
          AND ${normalizedOrderStatusSql("sales")} = 'entregado'
      ) d ON d.empresa_id = c.empresa_id AND d.client_id = c.id
      WHERE c.empresa_id = $1
    `,
    [companyId],
  );

  const customers = new Map<string, { name: string; seller: string; timestamps: number[] }>();
  for (const row of result.rows) {
    const current = customers.get(row.id) ?? { name: row.nombre_cliente, seller: row.vendedor, timestamps: [] };
    if (row.fecha) current.timestamps.push(dayStart(new Date(row.fecha)));
    customers.set(row.id, current);
  }

  const startMs = Date.parse(`${bounds.currentStart}T00:00:00-03:00`);
  const nextMs = Date.parse(`${bounds.nextStart}T00:00:00-03:00`);
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const altas: ChurnEntry[] = [];
  const bajas: ChurnEntry[] = [];
  for (const [id, customer] of customers) {
    const { alta, baja, firstMs, lostMs } = classifyChurn(customer.timestamps, startMs, nextMs);
    if (alta && firstMs != null) {
      altas.push({ customerId: id, customerName: customer.name, seller: customer.seller, date: toIso(firstMs) });
    }
    if (baja && lostMs != null) {
      bajas.push({ customerId: id, customerName: customer.name, seller: customer.seller, date: toIso(lostMs) });
    }
  }
  altas.sort((a, b) => a.date.localeCompare(b.date));
  bajas.sort((a, b) => a.date.localeCompare(b.date));

  return { altas, bajas, counts: { altas: altas.length, bajas: bajas.length, net: altas.length - bajas.length } };
}
