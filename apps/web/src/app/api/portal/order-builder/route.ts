import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import {
  money as roundMoney,
  priceForList,
  resolvePriceListName,
} from "@/lib/order-pricing";
import { createPreference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { acceptQuote } from "@/lib/quotes";
import type { AuthSession } from "@/lib/auth";

import { publicProductImageUrl } from "@/lib/storage";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VOLUME_THRESHOLD = 100_000;

function portalLineTotal(
  prices: Record<string, number>,
  presentationUnits: number,
  quantity: number,
  priceListName: string,
  rapidPayment: boolean,
) {
  const presentation = Math.max(1, Math.trunc(presentationUnits || 1));
  const volumeQuantity =
    presentation > 1 ? Math.floor(quantity / presentation) * presentation : 0;
  const regularQuantity = quantity - volumeQuantity;
  const regularUnitPrice = priceForList(prices, priceListName);
  const volumeUnitPrice =
    priceForList(prices, "L1 - suave") * (rapidPayment ? 0.95 : 1);
  const total = roundMoney(
    volumeQuantity * volumeUnitPrice + regularQuantity * regularUnitPrice,
  );
  return {
    total,
    effectiveUnitPrice:
      quantity > 0 ? roundMoney(total / quantity) : regularUnitPrice,
  };
}

export async function GET(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId") ?? "";
    const repeatSaleId = url.searchParams.get("repeatSaleId") ?? "";
    if (!identity.clientIds.includes(clientId))
      throw new ApiError(403, "Esa sucursal no pertenece a tu cuenta");

    const data = await withCompanyContext(
      identity.companyId,
      async (client) => {
        const customer = (
          await client.query<{
            id: string;
            name: string;
            price_list_name: string | null;
            payment_term_days: number | null;
          }>(
            `SELECT id::text, display_name AS name, price_list_name, payment_term_days FROM clients WHERE empresa_id=$1 AND id=$2::uuid`,
            [identity.companyId, clientId],
          )
        ).rows[0];
        if (!customer) throw new ApiError(404, "Cliente no encontrado");

        const lists = (
          await client.query<{ name: string }>(
            `SELECT nombre AS name FROM listas_precio WHERE empresa_id=$1 AND activa=1 AND (blocked_until IS NULL OR blocked_until<CURRENT_DATE) ORDER BY orden,id`,
            [identity.companyId],
          )
        ).rows.map((row) => row.name);
        const selectedList = resolvePriceListName(
          customer.price_list_name,
          lists,
        );
        const products = await client.query<{
          id: string;
          code: string;
          name: string;
          image_path: string | null;
          presentation_units: number;
          available: string;
          prices: Record<string, string | number> | null;
          purchase_count: number;
          usual_quantity: string;
        }>(
          `
        SELECT p.id::text, COALESCE(p.sku,p.category_code,'') AS code, p.name, p.image_path,
               COALESCE(p.presentation_units,1) AS presentation_units,
               GREATEST(COALESCE(stock.real,0)-COALESCE(reserved.qty,0),0)::text AS available,
               COALESCE(price_map.prices,'{}'::jsonb) AS prices,
               COALESCE(history.purchase_count,0)::int AS purchase_count,
               COALESCE(history.usual_quantity,0)::text AS usual_quantity
          FROM products p
          LEFT JOIN margenes m ON m.empresa_id=p.empresa_id AND m.codigo=CASE WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(p.category_code,'')),'[^A-Z0-9]','','g'),'') IS NOT NULL THEN LEFT(REGEXP_REPLACE(UPPER(p.category_code),'[^A-Z0-9]','','g'),10) ELSE 'CAT'||UPPER(SUBSTRING(MD5(COALESCE(p.category,'Sin categoria')) FROM 1 FOR 7)) END
          LEFT JOIN LATERAL (SELECT jsonb_object_agg(lp.nombre,COALESCE(NULLIF(ROUND(COALESCE(p.cost,0)*NULLIF(ml.multiplicador,1),2),0),NULLIF(ROUND(COALESCE(p.cost,0)*COALESCE(m.precio_1,1),2),0),p.sale_price,p.cost,0)) prices FROM listas_precio lp LEFT JOIN margenes_listas ml ON ml.empresa_id=lp.empresa_id AND ml.lista_id=lp.id AND ml.codigo=CASE WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(p.category_code,'')),'[^A-Z0-9]','','g'),'') IS NOT NULL THEN LEFT(REGEXP_REPLACE(UPPER(p.category_code),'[^A-Z0-9]','','g'),10) ELSE 'CAT'||UPPER(SUBSTRING(MD5(COALESCE(p.category,'Sin categoria')) FROM 1 FOR 7)) END WHERE lp.empresa_id=p.empresa_id AND lp.activa=1 AND (lp.blocked_until IS NULL OR lp.blocked_until<CURRENT_DATE)) price_map ON true
          LEFT JOIN LATERAL (SELECT COALESCE(SUM(CASE WHEN movement_type IN ('entrada_compra','ajuste_positivo') THEN quantity ELSE -quantity END),0) real FROM stock_movements WHERE empresa_id=p.empresa_id AND product_id=p.id) stock ON true
          LEFT JOIN LATERAL (SELECT COALESCE(SUM(si.quantity),0) qty FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.empresa_id=si.empresa_id WHERE si.empresa_id=p.empresa_id AND si.product_id=p.id AND COALESCE(s.order_status,s.status,'') IN ('cargado','confirmado','pendiente')) reserved ON true
          LEFT JOIN LATERAL (SELECT COUNT(DISTINCT si.sale_id)::int purchase_count, ROUND(AVG(si.quantity)) usual_quantity FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.empresa_id=si.empresa_id WHERE si.empresa_id=p.empresa_id AND si.product_id=p.id AND s.client_id=$2::uuid) history ON true
         WHERE p.empresa_id=$1 AND p.active=true
         ORDER BY COALESCE(history.purchase_count,0) DESC,p.name ASC`,
          [identity.companyId, clientId],
        );

        let repeatItems: { productId: string; quantity: number }[] = [];
        if (repeatSaleId) {
          if (!UUID_RE.test(repeatSaleId))
            throw new ApiError(400, "Pedido anterior inválido");
          repeatItems = (
            await client.query<{ product_id: string; quantity: string }>(
              `SELECT si.product_id::text,si.quantity::text FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.empresa_id=si.empresa_id WHERE si.empresa_id=$1 AND si.sale_id=$2::uuid AND s.client_id=$3::uuid ORDER BY si.id`,
              [identity.companyId, repeatSaleId, clientId],
            )
          ).rows.map((row) => ({
            productId: row.product_id,
            quantity: Number(row.quantity),
          }));
        }
        const offers = (
          await client.query<{
            id: string;
            name: string;
            price_mode: string;
            fixed_price: string | null;
            discount_percent: string | null;
            product_id: string;
            product_name: string;
            quantity: string;
          }>(
            `SELECT o.id::text,o.name,o.price_mode,o.fixed_price::text,o.discount_percent::text,i.product_id::text,p.name product_name,i.quantity::text FROM price_offers o JOIN price_offer_items i ON i.offer_id=o.id AND i.empresa_id=o.empresa_id JOIN products p ON p.id=i.product_id AND p.empresa_id=i.empresa_id WHERE o.empresa_id=$1 AND o.active=true AND (o.valid_from IS NULL OR o.valid_from<=CURRENT_DATE) AND (o.valid_to IS NULL OR o.valid_to>=CURRENT_DATE) ORDER BY o.created_at DESC,i.id`,
            [identity.companyId],
          )
        ).rows;
        const offerMap = new Map<
          string,
          {
            id: string;
            name: string;
            priceMode: string;
            fixedPrice: number | null;
            discountPercent: number | null;
            items: {
              productId: string;
              productName: string;
              quantity: number;
            }[];
          }
        >();
        for (const row of offers) {
          const offer = offerMap.get(row.id) ?? {
            id: row.id,
            name: row.name,
            priceMode: row.price_mode,
            fixedPrice:
              row.fixed_price === null ? null : Number(row.fixed_price),
            discountPercent:
              row.discount_percent === null
                ? null
                : Number(row.discount_percent),
            items: [],
          };
          offer.items.push({
            productId: row.product_id,
            productName: row.product_name,
            quantity: Number(row.quantity),
          });
          offerMap.set(row.id, offer);
        }
        return {
          customer: { ...customer, selectedList },
          lists,
          products: products.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            imageUrl: row.image_path
              ? publicProductImageUrl(row.image_path)
              : null,
            presentationUnits: row.presentation_units,
            available: Number(row.available),
            usualQuantity: Number(row.usual_quantity),
            purchaseCount: row.purchase_count,
            prices: Object.fromEntries(
              Object.entries(row.prices ?? {}).map(([key, value]) => [
                key,
                Number(value),
              ]),
            ),
          })),
          recommendations: products.rows
            .filter((row) => row.purchase_count > 0)
            .slice(0, 12)
            .map((row) => row.id),
          repeatItems,
          offers: [...offerMap.values()],
        };
      },
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const body = (await request.json()) as {
      clientId?: string;
      paymentMethod?: string;
      invoiceChoice?: "sin_factura" | "con_factura";
      items?: { productId?: string; quantity?: number }[];
    };
    const clientId = String(body.clientId ?? "");
    if (!identity.clientIds.includes(clientId))
      throw new ApiError(403, "Esa sucursal no pertenece a tu cuenta");
    const requested = (Array.isArray(body.items) ? body.items : [])
      .filter(
        (item) =>
          UUID_RE.test(String(item.productId ?? "")) &&
          Number.isInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0,
      )
      .slice(0, 100);
    if (!requested.length)
      throw new ApiError(400, "Agregá al menos un producto");
    const result = await withCompanyContext(
      identity.companyId,
      async (client) => {
        const customer = (
          await client.query<{
            name: string;
            legal_name: string;
            tax_id: string;
            fiscal_condition: string;
            phone: string;
            address: string;
            price_list_name: string;
            seller_id: string | null;
          }>(
            `SELECT c.display_name name,COALESCE(c.legal_name,'') legal_name,COALESCE(c.tax_id,'') tax_id,COALESCE(c.fiscal_condition,'') fiscal_condition,COALESCE(c.phone,'') phone,COALESCE(c.address,'') address,COALESCE(c.price_list_name,'') price_list_name,(SELECT p.id::text FROM usuario_empresa ue JOIN profiles p ON p.id=ue.id_usuario WHERE ue.empresa_id=c.empresa_id AND ue.activo=true AND (lower(COALESCE(p.full_name,''))=lower(COALESCE(c.seller_name,'')) OR lower(COALESCE(p.username,''))=lower(COALESCE(c.seller_name,''))) LIMIT 1) seller_id FROM clients c WHERE c.empresa_id=$1 AND c.id=$2::uuid`,
            [identity.companyId, clientId],
          )
        ).rows[0];
        if (!customer) throw new ApiError(404, "Cliente no encontrado");
        const lists = (
          await client.query<{ name: string }>(
            `SELECT nombre name FROM listas_precio WHERE empresa_id=$1 AND activa=1 AND (blocked_until IS NULL OR blocked_until<CURRENT_DATE)`,
            [identity.companyId],
          )
        ).rows.map((row) => row.name);
        const ids = requested.map((item) => item.productId);
        const rows = await client.query<{
          id: string;
          name: string;
          presentation_units: number;
          prices: Record<string, string | number>;
        }>(
          `SELECT p.id::text,p.name,COALESCE(p.presentation_units,1) presentation_units,COALESCE(jsonb_object_agg(lp.nombre,COALESCE(NULLIF(ROUND(COALESCE(p.cost,0)*NULLIF(ml.multiplicador,1),2),0),p.sale_price,p.cost,0)) FILTER (WHERE lp.id IS NOT NULL),'{}'::jsonb) prices FROM products p LEFT JOIN listas_precio lp ON lp.empresa_id=p.empresa_id AND lp.activa=1 LEFT JOIN margenes_listas ml ON ml.empresa_id=lp.empresa_id AND ml.lista_id=lp.id AND ml.codigo=CASE WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(p.category_code,'')),'[^A-Z0-9]','','g'),'') IS NOT NULL THEN LEFT(REGEXP_REPLACE(UPPER(p.category_code),'[^A-Z0-9]','','g'),10) ELSE 'CAT'||UPPER(SUBSTRING(MD5(COALESCE(p.category,'Sin categoria')) FROM 1 FOR 7)) END WHERE p.empresa_id=$1 AND p.active=true AND p.id=ANY($2::uuid[]) GROUP BY p.id`,
          [identity.companyId, ids],
        );
        if (rows.rows.length !== new Set(ids).size)
          throw new ApiError(400, "Uno de los productos ya no está disponible");
        const byId = new Map(rows.rows.map((row) => [row.id, row]));
        const baseTotal = requested.reduce((sum, item) => {
          const product = byId.get(String(item.productId))!;
          const prices = Object.fromEntries(
            Object.entries(product.prices).map(([key, value]) => [
              key,
              Number(value),
            ]),
          );
          return (
            sum + priceForList(prices, "L3 - caro") * Number(item.quantity)
          );
        }, 0);
        const paymentMethod = ["cuenta_corriente", "efectivo", "qr"].includes(
          String(body.paymentMethod),
        )
          ? String(body.paymentMethod)
          : "cuenta_corriente";
        const rapidPayment =
          paymentMethod === "efectivo" || paymentMethod === "qr";
        const list = resolvePriceListName(
          rapidPayment
            ? "L1 - suave"
            : baseTotal >= VOLUME_THRESHOLD
              ? "L2 - ANCLA"
              : "L3 - caro",
          lists,
        );
        const lines = requested.map((item) => {
          const product = byId.get(String(item.productId))!;
          const prices = Object.fromEntries(
            Object.entries(product.prices).map(([k, v]) => [k, Number(v)]),
          );
          const unit = priceForList(prices, list);
          if (unit <= 0)
            throw new ApiError(
              400,
              `${product.name} no tiene precio en ${list}`,
            );
          const pricing = portalLineTotal(
            prices,
            product.presentation_units,
            Number(item.quantity),
            list,
            rapidPayment,
          );
          return {
            ...product,
            quantity: Number(item.quantity),
            unit: pricing.effectiveUnitPrice,
            total: pricing.total,
          };
        });
        const netAmount = roundMoney(
          lines.reduce((sum, line) => sum + line.total, 0),
        );
        if (netAmount < 50_000)
          throw new ApiError(
            400,
            "El pedido mínimo es de $50.000 netos. Faltan $" +
              roundMoney(50_000 - netAmount).toLocaleString("es-AR"),
          );
        const invoiceChoice =
          body.invoiceChoice === "con_factura" ? "con_factura" : "sin_factura";
        const vatRate = invoiceChoice === "con_factura" ? 21 : 10.5;
        const vatAmount = roundMoney((netAmount * vatRate) / 100);
        const total = roundMoney(netAmount + vatAmount);
        const desiredDocument =
          invoiceChoice === "con_factura"
            ? /responsable.*inscripto/i.test(customer.fiscal_condition)
              ? "factura_a"
              : "factura_b"
            : "remito";
        const fallbackSeller =
          customer.seller_id ??
          (
            await client.query<{ id: string }>(
              `SELECT p.id::text FROM usuario_empresa ue JOIN profiles p ON p.id=ue.id_usuario WHERE ue.empresa_id=$1 AND ue.activo=true AND ue.role::text IN ('vendedor','jefe','administrador') ORDER BY CASE ue.role::text WHEN 'vendedor' THEN 0 WHEN 'jefe' THEN 1 ELSE 2 END LIMIT 1`,
              [identity.companyId],
            )
          ).rows[0]?.id;
        if (!fallbackSeller)
          throw new ApiError(503, "No hay un comercial disponible");
        await client.query("SELECT pg_advisory_xact_lock(83011,$1::int)", [
          identity.companyId,
        ]);
        const seq = await client.query<{ value: string }>(
          `SELECT (COALESCE(MAX(substring(quote_number FROM '^P-([0-9]+)$')::bigint),0)+1)::text value FROM quotes WHERE empresa_id=$1 AND quote_number~'^P-[0-9]+$'`,
          [identity.companyId],
        );
        const number = `P-${String(Number(seq.rows[0]?.value ?? 1)).padStart(4, "0")}`;
        const quote = await client.query<{ id: string }>(
          `INSERT INTO quotes (
             quote_number,client_id,seller_id,status,total_amount,validity_days,include_vat,vat_rate,desired_document,
             active_price_list,price_list_name,discount_percent,net_amount,discount_amount,subtotal_amount,vat_amount,
             client_name,client_legal_name,client_document,client_fiscal_condition,client_phone,client_address,
             empresa_id,visible_to_all
           ) VALUES (
             $1,$2::uuid,$3::uuid,'pendiente',$4,15,true,$5,$6,1,$7,0,$8,0,$8,$9,
             $10,$11,$12,$13,$14,$15,$16,$17
           ) RETURNING id::text`,
          [
            number,
            clientId,
            fallbackSeller,
            total,
            vatRate,
            desiredDocument,
            list,
            netAmount,
            vatAmount,
            customer.name,
            customer.legal_name,
            customer.tax_id,
            customer.fiscal_condition,
            customer.phone,
            customer.address,
            identity.companyId,
            paymentMethod !== "qr",
          ],
        );
        for (const line of lines)
          await client.query(
            `INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,discount,total_amount,empresa_id) VALUES ($1::uuid,$2::uuid,$3,$4,$5,0,$6,$7)`,
            [
              quote.rows[0]!.id,
              line.id,
              line.name,
              line.quantity,
              line.unit,
              line.total,
              identity.companyId,
            ],
          );
        return {
          quoteId: quote.rows[0]!.id,
          quoteNumber: number,
          sellerId: fallbackSeller,
          paymentMethod,
          amount: total,
        };
      },
    );
    if (result.paymentMethod === "qr") {
      const intentId = randomUUID();
      await withCompanyContext(identity.companyId, (client) =>
        client.query(
          `INSERT INTO customer_portal_payment_intents (id,empresa_id,portal_account_id,client_id,sale_ids,amount,portal_user_id) VALUES ($1,$2,$3::uuid,$4::uuid,ARRAY[$7::uuid],$5,$6::uuid)`,
          [
            intentId,
            identity.companyId,
            identity.accountId,
            clientId,
            result.amount,
            identity.userId,
            result.quoteId,
          ],
        ),
      );
      const preference = await createPreference({
        intentId,
        amount: result.amount,
        description: `Pedido Starlim ${result.quoteNumber}`,
        email: identity.email,
        origin: new URL(request.url).origin,
      });
      const checkoutUrl = String(preference.init_point || "");
      if (!checkoutUrl)
        throw new ApiError(502, "Mercado Pago no devolvió el enlace de pago");
      await withCompanyContext(identity.companyId, (client) =>
        client.query(
          `UPDATE customer_portal_payment_intents SET mp_preference_id=$1,updated_at=now() WHERE id=$2::uuid AND empresa_id=$3`,
          [preference.id, intentId, identity.companyId],
        ),
      );
      return ok(
        {
          data: {
            quoteNumber: result.quoteNumber,
            checkout: {
              intentId,
              amount: result.amount,
              checkoutUrl,
              qrDataUrl: await QRCode.toDataURL(checkoutUrl, {
                width: 320,
                margin: 1,
              }),
              status: "created",
            },
          },
        },
        201,
      );
    }

    const systemSession: AuthSession = {
      userId: result.sellerId,
      username: identity.displayName,
      email: identity.email,
      displayName: identity.displayName,
      role: "vendedor",
      companyId: identity.companyId,
      companyName: "Starlim",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
    const accepted = await acceptQuote(systemSession, result.quoteId);
    return ok(
      { data: { quoteNumber: result.quoteNumber, orderId: accepted.orderId } },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
