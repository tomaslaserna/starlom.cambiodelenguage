import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";

export type PriceListRecipient = { id: string; name: string };

export type PriceListFollowupSignal = {
  id: string;
  customerId: string | null;
  priceListId: number;
  priceListName: string;
  recipientType: "cliente" | "prospecto";
  recipientName: string;
  recipientPhone: string;
  purpose: string;
  followUpOn: string;
  sharedAt: string;
};

type PriceListShareInput = {
  listId: number;
  recipientType: "cliente" | "prospecto";
  customerId?: string;
  prospectName?: string;
  prospectPhone?: string;
  purpose: string;
  followUpDays: number;
};

export async function listPriceListRecipients(companyId: number): Promise<PriceListRecipient[]> {
  const result = await queryWithCompanyContext<{ id: string; name: string }>(
    companyId,
    `SELECT id::text AS id, COALESCE(NULLIF(display_name, ''), legal_name, 'Cliente') AS name
       FROM clients
      WHERE empresa_id = $1 AND active = true
      ORDER BY COALESCE(NULLIF(display_name, ''), legal_name, '') ASC, id ASC`,
    [companyId],
  );
  return result.rows;
}

export async function recordPriceListShare(session: AuthSession, input: PriceListShareInput) {
  if (!Number.isInteger(input.listId) || input.listId <= 0) throw new ApiError(400, "Lista de precios inválida");
  if (!input.purpose.trim()) throw new ApiError(400, "Indica el motivo del envío");
  if (![3, 7, 15, 30].includes(input.followUpDays)) throw new ApiError(400, "Plazo de seguimiento inválido");

  return withCompanyContext(session.companyId, async (client) => {
    const priceList = (
      await client.query<{ id: number; name: string }>(
        `SELECT id, nombre AS name
           FROM listas_precio
          WHERE id = $1 AND empresa_id = $2 AND activa = 1
          LIMIT 1`,
        [input.listId, session.companyId],
      )
    ).rows[0];
    if (!priceList) throw new ApiError(404, "La lista de precios no existe o no está activa");

    let customerId: string | null = null;
    let recipientName = input.prospectName?.trim() ?? "";
    let recipientPhone = input.prospectPhone?.trim() ?? "";

    if (input.recipientType === "cliente") {
      const customer = (
        await client.query<{ id: string; name: string; phone: string }>(
          `SELECT id::text AS id,
                  COALESCE(NULLIF(display_name, ''), legal_name, 'Cliente') AS name,
                  COALESCE(phone, '') AS phone
             FROM clients
            WHERE id = $1::uuid AND empresa_id = $2 AND active = true
            LIMIT 1`,
          [input.customerId, session.companyId],
        )
      ).rows[0];
      if (!customer) throw new ApiError(404, "Selecciona un cliente válido");
      customerId = customer.id;
      recipientName = customer.name;
      recipientPhone = customer.phone;
    } else if (!recipientName) {
      throw new ApiError(400, "Ingresa el nombre del prospecto");
    }

    if (recipientName.length > 160) throw new ApiError(400, "El nombre del destinatario es demasiado largo");
    if (recipientPhone.length > 50) throw new ApiError(400, "El teléfono es demasiado largo");
    if (input.purpose.trim().length > 160) throw new ApiError(400, "El motivo es demasiado largo");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO price_list_shares
         (empresa_id, seller_id, price_list_id, price_list_name, recipient_type,
          customer_id, recipient_name, recipient_phone, purpose, follow_up_on)
       VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9,
               CURRENT_DATE + $10::integer)
       RETURNING id::text AS id`,
      [
        session.companyId,
        session.userId,
        priceList.id,
        priceList.name,
        input.recipientType,
        customerId,
        recipientName,
        recipientPhone,
        input.purpose.trim(),
        input.followUpDays,
      ],
    );
    return { id: inserted.rows[0]!.id, listName: priceList.name };
  });
}

export async function getPriceListFollowupSignals(session: AuthSession): Promise<PriceListFollowupSignal[]> {
  const result = await queryWithCompanyContext<{
    id: string;
    customer_id: string | null;
    price_list_id: string;
    price_list_name: string;
    recipient_type: "cliente" | "prospecto";
    recipient_name: string;
    recipient_phone: string;
    purpose: string;
    follow_up_on: string;
    shared_at: string;
  }>(
    session.companyId,
    `SELECT id::text, customer_id::text, price_list_id::text, price_list_name, recipient_type,
            recipient_name, recipient_phone, purpose, follow_up_on::text, shared_at::text
       FROM price_list_shares
      WHERE empresa_id = $1 AND seller_id = $2::uuid
        AND status = 'pendiente' AND follow_up_on <= CURRENT_DATE
      ORDER BY follow_up_on ASC, shared_at ASC
      LIMIT 12`,
    [session.companyId, session.userId],
    { cache: false },
  );
  return result.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    priceListId: Number(row.price_list_id),
    priceListName: row.price_list_name,
    recipientType: row.recipient_type,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    purpose: row.purpose,
    followUpOn: row.follow_up_on,
    sharedAt: row.shared_at,
  }));
}

export async function resolvePriceListFollowup(session: AuthSession, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `UPDATE price_list_shares
        SET status = 'revisado', resolved_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid AND empresa_id = $2 AND seller_id = $3::uuid
        AND status = 'pendiente'
      RETURNING id::text`,
    [id, session.companyId, session.userId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Seguimiento no encontrado");
}

export async function snoozePriceListFollowup(session: AuthSession, id: string, days = 7) {
  if (![3, 7, 15, 30].includes(days)) throw new ApiError(400, "Plazo inválido");
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `UPDATE price_list_shares
        SET follow_up_on = CURRENT_DATE + $1::integer, updated_at = NOW()
      WHERE id = $2::uuid AND empresa_id = $3 AND seller_id = $4::uuid
        AND status = 'pendiente'
      RETURNING id::text`,
    [days, id, session.companyId, session.userId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Seguimiento no encontrado");
}
