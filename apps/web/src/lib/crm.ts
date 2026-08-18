import type { AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { listSalesToCollectWhere } from "@/lib/collections";
import {
  classifyQuote,
  topQuoteClients,
  type QuoteBucket,
  type TopQuoteClient,
  type VendorQuote,
} from "@/lib/crm-quotes";
import { queryWithCompanyContext } from "@/lib/db";
import { getCustomerFollowUp } from "@/lib/messages";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { parsePagination } from "@/lib/pagination";
import { listPriceListParameters } from "@/lib/pricing";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

// El vínculo vendedor <-> ventas/clientes es por texto (seller_name), igual que
// vendors-management.ts. Devolvemos los nombres candidatos (usuario, nombre y
// primer nombre) en MAYUSCULAS para matchear de forma tolerante.
export function sellerCandidates(session: AuthSession): string[] {
  const raw = [session.username, session.displayName].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const set = new Set<string>();
  for (const name of raw) {
    const trimmed = name.trim();
    set.add(trimmed.toUpperCase());
    set.add(trimmed.split(/\s+/)[0]!.toUpperCase());
  }
  return [...set];
}

export type VendorProfile = {
  vendor: string;
  clientsInCharge: number;
  ownClients: number;
  monthSalesTotal: number;
  monthSalesCount: number;
  closedSales30d: number;
  commissionRate: number;
  accruedCommission: number;
  activeQuotes: number;
};

export async function getVendorProfile(session: AuthSession): Promise<VendorProfile> {
  const names = sellerCandidates(session);
  const sellerMatch = "UPPER(BTRIM(COALESCE(s.seller_name, ''))) = ANY($2::text[])";
  const result = await queryWithCompanyContext<{
    a_cargo: string;
    propios: string;
    ventas_mes_total: string;
    ventas_mes_count: string;
    cerradas_30d: string;
    ventas_30d_total: string;
    commission_rate: string;
    presupuestos_vigentes: string;
  }>(
    session.companyId,
    `
      SELECT
        (SELECT COUNT(*) FROM clients c
           WHERE c.empresa_id = $1
             AND UPPER(BTRIM(COALESCE(c.assigned_seller, ''))) = ANY($2::text[])) AS a_cargo,
        (SELECT COUNT(*) FROM clients c
           WHERE c.empresa_id = $1
             AND UPPER(BTRIM(COALESCE(c.seller_name, ''))) = ANY($2::text[])) AS propios,
        (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s
           WHERE s.empresa_id = $1 AND ${sellerMatch} AND ${canonicalSalesSourceSql("s")}
             AND ${normalizedOrderStatusSql("s")} = 'entregado'
             AND s.sale_date >= date_trunc('month', CURRENT_DATE)::date) AS ventas_mes_total,
        (SELECT COUNT(*) FROM sales s
           WHERE s.empresa_id = $1 AND ${sellerMatch} AND ${canonicalSalesSourceSql("s")}
             AND ${normalizedOrderStatusSql("s")} = 'entregado'
             AND s.sale_date >= date_trunc('month', CURRENT_DATE)::date) AS ventas_mes_count,
        (SELECT COUNT(*) FROM sales s
           WHERE s.empresa_id = $1 AND ${sellerMatch} AND ${canonicalSalesSourceSql("s")}
             AND ${normalizedOrderStatusSql("s")} = 'entregado'
             AND s.sale_date >= CURRENT_DATE - 30) AS cerradas_30d,
        (SELECT COALESCE(SUM(s.total_amount), 0) FROM sales s
           WHERE s.empresa_id = $1 AND ${sellerMatch} AND ${canonicalSalesSourceSql("s")}
             AND ${normalizedOrderStatusSql("s")} = 'entregado'
             AND s.sale_date >= CURRENT_DATE - 30) AS ventas_30d_total,
        (SELECT COALESCE(MAX(vc.commission_rate), 0) FROM vendor_commissions vc
           WHERE vc.empresa_id = $1 AND UPPER(BTRIM(vc.vendor)) = ANY($2::text[])) AS commission_rate,
        (SELECT COUNT(*) FROM quotes q
           JOIN profiles p ON p.id = q.seller_id
           WHERE q.empresa_id = $1 AND q.status = 'pendiente'
             AND UPPER(BTRIM(COALESCE(p.username, p.full_name, ''))) = ANY($2::text[])) AS presupuestos_vigentes
    `,
    [session.companyId, names],
  );

  const row = result.rows[0];
  const rate = Number(row?.commission_rate ?? 0);
  const sales30d = Number(row?.ventas_30d_total ?? 0);
  return {
    vendor: session.displayName || session.username || "",
    clientsInCharge: Number(row?.a_cargo ?? 0),
    ownClients: Number(row?.propios ?? 0),
    monthSalesTotal: Number(row?.ventas_mes_total ?? 0),
    monthSalesCount: Number(row?.ventas_mes_count ?? 0),
    closedSales30d: Number(row?.cerradas_30d ?? 0),
    commissionRate: rate,
    accruedCommission: sales30d * (rate / 100),
    activeQuotes: Number(row?.presupuestos_vigentes ?? 0),
  };
}

export type CrmClient = {
  customerId: string;
  customerName: string;
  phone: string;
  zona: string;
  relation: "propio" | "a cargo";
  daysSinceLastPurchase: number | null;
  averageDays: number | null;
  expectedNextPurchase: string | null;
  lastPurchase: string | null;
};

export type CrmClientsResult = {
  groups: Record<string, CrmClient[]>;
  counts: Record<string, number>;
  zonas: string[];
};

const STATE_KEYS = ["al_dia", "contactar", "riesgo", "perdido", "sin_historial"] as const;

// Reusa la clasificacion de messages.ts (getCustomerFollowUp) y la recorta a los
// clientes del vendedor (propios ∪ a cargo), enriqueciendo con zona y relacion.
export async function getVendorClients(session: AuthSession): Promise<CrmClientsResult> {
  const names = new Set(sellerCandidates(session));
  const followUp = await getCustomerFollowUp(session.companyId);

  const infoRows = (
    await queryWithCompanyContext<{ id: string; loc: string; prov: string; sn: string; asg: string }>(
      session.companyId,
      `SELECT id::text AS id, COALESCE(locality, '') AS loc, COALESCE(province, '') AS prov,
              UPPER(BTRIM(COALESCE(seller_name, ''))) AS sn, UPPER(BTRIM(COALESCE(assigned_seller, ''))) AS asg
         FROM clients WHERE empresa_id = $1`,
      [session.companyId],
    )
  ).rows;
  const byId = new Map(infoRows.map((row) => [row.id, row]));

  const groups: Record<string, CrmClient[]> = Object.fromEntries(STATE_KEYS.map((key) => [key, []]));
  const zonas = new Set<string>();

  for (const key of STATE_KEYS) {
    const rows = (followUp.groups[key] ?? []) as Array<Record<string, unknown>>;
    for (const raw of rows) {
      const info = byId.get(String(raw.customerId));
      if (!info) continue;
      const propio = names.has(info.sn);
      const aCargo = names.has(info.asg);
      if (!propio && !aCargo) continue;
      const zona = info.loc || info.prov || "Sin zona";
      zonas.add(zona);
      groups[key]!.push({
        customerId: String(raw.customerId),
        customerName: String(raw.customerName ?? ""),
        phone: String(raw.phone ?? ""),
        zona,
        relation: propio ? "propio" : "a cargo",
        daysSinceLastPurchase: raw.daysSinceLastPurchase == null ? null : Number(raw.daysSinceLastPurchase),
        averageDays: raw.averageDays == null ? null : Number(raw.averageDays),
        expectedNextPurchase: (raw.expectedNextPurchase as string) ?? null,
        lastPurchase: (raw.lastPurchase as string) ?? null,
      });
    }
  }

  const counts = Object.fromEntries(STATE_KEYS.map((key) => [key, groups[key]!.length]));
  return { groups, counts, zonas: [...zonas].sort((a, b) => a.localeCompare(b)) };
}

export type VendorQuotesResult = {
  buckets: Record<QuoteBucket, VendorQuote[]>;
  counts: Record<QuoteBucket, number>;
  topClients: TopQuoteClient[];
};

const QUOTE_BUCKETS: QuoteBucket[] = ["vigentes", "por_vencer", "vencidos", "aceptados"];

// Presupuestos del vendedor (quotes filtradas por seller_id -> profiles), agrupados
// por vencimiento con classifyQuote y con el top de clientes que mas piden.
export async function getVendorQuotes(session: AuthSession): Promise<VendorQuotesResult> {
  const names = sellerCandidates(session);
  const rows = (
    await queryWithCompanyContext<{
      id: string;
      quote_number: string;
      client_name: string;
      total: string;
      issue_date: string | null;
      expiration_date: string | null;
      days_remaining: string | null;
      status: string;
      approved_this_month: boolean;
    }>(
      session.companyId,
      `
        SELECT q.id::text AS id,
               COALESCE(NULLIF(q.quote_number, ''), 'Sin numero') AS quote_number,
               COALESCE(NULLIF(q.client_name, ''), c.display_name, c.legal_name, '') AS client_name,
               q.total_amount::text AS total,
               q.created_at::date::text AS issue_date,
               (q.created_at::date + (q.validity_days || ' days')::interval)::date::text AS expiration_date,
               ((q.created_at::date + (q.validity_days || ' days')::interval)::date - CURRENT_DATE)::text AS days_remaining,
               q.status,
               (q.status = 'aceptada' AND q.approved_at >= date_trunc('month', CURRENT_DATE)) AS approved_this_month
        FROM quotes q
        LEFT JOIN clients c ON c.id = q.client_id AND c.empresa_id = q.empresa_id
        LEFT JOIN profiles p ON p.id = q.seller_id
        WHERE q.empresa_id = $1
          AND (UPPER(BTRIM(COALESCE(p.username, p.full_name, ''))) = ANY($2::text[])
               OR q.visible_to_all = true)
        ORDER BY q.created_at DESC, q.id DESC
      `,
      [session.companyId, names],
    )
  ).rows;

  const quotes: VendorQuote[] = rows.map((row) => ({
    id: row.id,
    quoteNumber: row.quote_number,
    clientName: row.client_name,
    total: Number(row.total),
    issueDate: row.issue_date,
    expirationDate: row.expiration_date,
    daysRemaining: row.days_remaining == null ? null : Number(row.days_remaining),
    status: row.status,
    approvedThisMonth: Boolean(row.approved_this_month),
  }));

  const buckets: Record<QuoteBucket, VendorQuote[]> = {
    vigentes: [],
    por_vencer: [],
    vencidos: [],
    aceptados: [],
  };
  for (const quote of quotes) {
    const bucket = classifyQuote(quote.status, quote.daysRemaining, quote.approvedThisMonth);
    if (bucket) buckets[bucket].push(quote);
  }

  const counts = Object.fromEntries(
    QUOTE_BUCKETS.map((bucket) => [bucket, buckets[bucket].length]),
  ) as Record<QuoteBucket, number>;

  return { buckets, counts, topClients: topQuoteClients(quotes) };
}

export type PublishedPriceList = {
  id: number;
  name: string;
  validFrom: string | null;
  validTo: string | null;
};

// Listas de precios activas que publica Administracion, con su vigencia.
export async function getPublishedPriceLists(companyId: number): Promise<PublishedPriceList[]> {
  const lists = await listPriceListParameters(companyId);
  return lists
    .filter((list) => list.active)
    .map((list) => ({
      id: list.id,
      name: list.name,
      validFrom: list.validFrom,
      validTo: list.validTo,
    }));
}

// Crea un recordatorio para el vendedor de contactar a un cliente (boton Agendar).
export async function scheduleClientReminder(
  session: AuthSession,
  input: { customerName: string; sendAt: string | null },
) {
  await queryWithCompanyContext(
    session.companyId,
    `
      INSERT INTO recordatorios (
        titulo, descripcion, prioridad, fecha_limite, fecha_envio, usuario,
        recurrencia_tipo, recurrencia_activa, empresa_id
      )
      VALUES ($1, $2, 'media', $3, $3, $4, 'unica', FALSE, $5)
    `,
    [
      `Contactar a ${input.customerName}`,
      "Recordatorio generado desde el CRM (cliente a recontactar).",
      input.sendAt,
      session.username,
      session.companyId,
    ],
    { cache: false },
  );
}

export type VendorCustomer = {
  id: string;
  name: string;
  businessName: string;
  taxId: string;
  phone: string;
  city: string;
  province: string;
  priceList: string;
  status: string;
  relation: "propio" | "a cargo";
};

// Base de datos de clientes del vendedor (propios ∪ a cargo). Espeja listCustomers
// (catalog.ts) pero acota al vendedor logueado y agrega la relacion.
export async function getVendorCustomers(
  session: AuthSession,
  input: { query?: string | null; page?: string | null; pageSize?: string | null } = {},
) {
  const names = sellerCandidates(session);
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [session.companyId, names];
  const sellerFilter =
    "(UPPER(BTRIM(COALESCE(seller_name,''))) = ANY($2::text[]) OR UPPER(BTRIM(COALESCE(assigned_seller,''))) = ANY($2::text[]))";
  const filters = ["empresa_id = $1", sellerFilter];
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    const p = params.length;
    filters.push(
      `(display_name ILIKE $${p} ESCAPE '\\' OR legal_name ILIKE $${p} ESCAPE '\\' OR tax_id ILIKE $${p} ESCAPE '\\' OR phone ILIKE $${p} ESCAPE '\\')`,
    );
  }
  const where = filters.join(" AND ");

  const countResult = await queryWithCompanyContext<{ total: string }>(
    session.companyId,
    `SELECT COUNT(*)::text AS total FROM clients WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    phone: string | null;
    locality: string | null;
    province: string | null;
    price_list_name: string | null;
    active: boolean;
    relation: "propio" | "a cargo";
  }>(
    session.companyId,
    `
      SELECT id::text AS id, display_name, legal_name, tax_id, phone,
             locality, province, price_list_name, active,
             CASE WHEN UPPER(BTRIM(COALESCE(seller_name,''))) = ANY($2::text[])
                  THEN 'propio' ELSE 'a cargo' END AS relation
        FROM clients
       WHERE ${where}
       ORDER BY display_name ASC, id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      name: row.display_name,
      businessName: row.legal_name ?? "",
      taxId: row.tax_id ?? "",
      phone: row.phone ?? "",
      city: row.locality ?? "",
      province: row.province ?? "",
      priceList: row.price_list_name ?? "",
      status: row.active ? "Activo" : "Inactivo",
      relation: row.relation,
    })),
    meta: {
      query,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

// Ventas a cobrar de los clientes del vendedor (propios ∪ a cargo). Reusa el
// SELECT canonico de collections.ts, acotando por el cliente (alias cli).
export async function getVendorCollections(session: AuthSession) {
  const names = sellerCandidates(session);
  return listSalesToCollectWhere(
    session.companyId,
    "AND (UPPER(BTRIM(COALESCE(cli.seller_name,''))) = ANY($2::text[]) OR UPPER(BTRIM(COALESCE(cli.assigned_seller,''))) = ANY($2::text[]))",
    [names],
  );
}

// Guard: la venta debe pertenecer a un cliente del vendedor, si no 403.
export async function assertVendorOwnsSale(session: AuthSession, saleId: string) {
  const names = sellerCandidates(session);
  const result = await queryWithCompanyContext<{ ok: number }>(
    session.companyId,
    `
      SELECT 1 AS ok
        FROM sales v
        JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
       WHERE v.id = $1::uuid AND v.empresa_id = $2
         AND (UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($3::text[])
              OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($3::text[]))
       LIMIT 1
    `,
    [saleId, session.companyId, names],
  );
  if (!result.rows[0]) {
    throw new ApiError(403, "No podés registrar cobros de una venta que no es de tus clientes.");
  }
}
