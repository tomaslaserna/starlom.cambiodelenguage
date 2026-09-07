"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomer,
  customerInputFromBody,
  getCustomer,
  updateCustomer,
  updateCustomerBusinessSegment,
  updateCustomerReceiptType,
} from "@/lib/catalog-management";
import { deleteCustomer, mergeCustomers } from "@/lib/customer-admin";
import { stringFieldsFromFormData } from "@/lib/storage";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { envValue } from "@/lib/env";
import { supabaseServiceRoleKey } from "@/lib/auth";
import { withCompanyContext } from "@/lib/db";

const CLIENTES_ELIMINAR = { resource: "clientes", action: "eliminar" } as const;

export async function enableCustomerPortalAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) redirect(`/customers/${clientId}?portalError=${encodeURIComponent("Ingresá un correo válido")}`);
  let outcome: { invitationSent: boolean } | { error: string };
  try {
    const existing = await withCompanyContext(session.companyId, (db) => db.query<{ id: string }>(`SELECT id::text FROM customer_portal_accounts WHERE empresa_id=$1 AND lower(email)=$2`, [session.companyId, email]));
    let accountId = existing.rows[0]?.id;
    let invitationSent = false;
    if (!accountId) {
      const supabaseUrl = envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
      if (!supabaseUrl) throw new Error("Falta configurar Supabase");
      const supabase = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey(), { auth: { autoRefreshToken: false, persistSession: false } });
      const appUrl = envValue("NEXT_PUBLIC_APP_URL") || "https://starlim.vercel.app";
      const invitation = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl.replace(/\/$/, "")}/portal` });
      let authUser = invitation.data.user;
      invitationSent = !invitation.error && Boolean(authUser);
      if (!authUser && invitation.error) {
        const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        authUser = users.data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
      }
      if (!authUser) throw new Error(invitation.error?.message || "No se pudo habilitar ese correo");
      const created = await withCompanyContext(session.companyId, (db) => db.query<{ id: string }>(`INSERT INTO customer_portal_accounts (empresa_id,auth_user_id,email,display_name) VALUES ($1,$2::uuid,$3,$4) ON CONFLICT (auth_user_id) DO UPDATE SET active=TRUE, updated_at=now() RETURNING id::text`, [session.companyId, authUser.id, email, email.split("@")[0]]));
      accountId = created.rows[0]!.id;
    }
    await withCompanyContext(session.companyId, (db) => db.query(`INSERT INTO customer_portal_memberships (empresa_id,portal_account_id,client_id,is_default) VALUES ($1,$2::uuid,$3::uuid,true) ON CONFLICT (portal_account_id,client_id) DO NOTHING`, [session.companyId, accountId, clientId]));
    revalidatePath(`/customers/${clientId}`);
    outcome = { invitationSent };
  } catch (error) {
    console.error("[customer-portal] enable failed", { clientId, email, error });
    const message = error instanceof Error ? error.message : "No se pudo habilitar el acceso";
    outcome = { error: message };
  }
  if ("error" in outcome) redirect(`/customers/${clientId}?portalError=${encodeURIComponent(outcome.error)}`);
  redirect(`/customers/${clientId}?portalEnabled=1&invited=${outcome.invitationSent ? "1" : "0"}`);
}

export async function setCustomerPortalPasswordAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
  const accountId = uuidParam(String(formData.get("accountId") ?? ""), "Acceso al portal");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect(`/customers/${clientId}?portalError=${encodeURIComponent("La contraseña debe tener al menos 8 caracteres")}`);
  try {
    const access = await withCompanyContext(session.companyId, (db) => db.query<{ auth_user_id: string }>(`SELECT a.auth_user_id::text FROM customer_portal_accounts a JOIN customer_portal_memberships m ON m.portal_account_id=a.id AND m.empresa_id=a.empresa_id WHERE a.empresa_id=$1 AND a.id=$2::uuid AND m.client_id=$3::uuid`, [session.companyId, accountId, clientId]));
    const authUserId = access.rows[0]?.auth_user_id;
    if (!authUserId) throw new Error("Ese acceso no está vinculado al cliente");
    const supabaseUrl = envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Falta configurar Supabase");
    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceRoleKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await supabase.auth.admin.updateUserById(authUserId, { password });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[customer-portal] password update failed", { clientId, accountId, error });
    const message = error instanceof Error ? error.message : "No se pudo cambiar la contraseña";
    redirect(`/customers/${clientId}?portalError=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/customers/${clientId}`);
  redirect(`/customers/${clientId}?portalPasswordUpdated=1`);
}

export async function createCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "crear" }]);
  await createCustomer(session.companyId, customerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/customers");
  revalidatePath("/crm/clientes");
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo.startsWith("/crm/") ? returnTo : "/customers?created=1");
}

export async function updateCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  const current = await getCustomer(session.companyId, id);
  await updateCustomer(
    session.companyId,
    id,
    customerInputFromBody(stringFieldsFromFormData(formData), {
      name: current.name,
      businessName: current.businessName,
      taxIdType: current.taxIdType,
      taxId: current.taxId,
      vatCondition: current.vatCondition,
      phone: current.phone,
      address: current.address,
      city: current.city,
      province: current.province,
      priceList: current.priceList,
      receiptType: current.receiptType,
      status: current.status,
      seller: current.seller,
      assignedSeller: current.assignedSeller,
      observation: current.observation,
      businessSegment: current.businessSegment,
    }),
  );
  revalidatePath("/customers");
}

export async function updateCustomerReceiptTypeAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const fields = stringFieldsFromFormData(formData);
  await updateCustomerReceiptType(
    session.companyId,
    uuidParam(fields.id, "Cliente"),
    fields.receiptType ?? "",
  );
  revalidatePath("/customers");
  revalidatePath("/orders");
  revalidatePath("/orders/new");
}

export async function updateCustomerBusinessSegmentAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const fields = stringFieldsFromFormData(formData);
  await updateCustomerBusinessSegment(
    session.companyId,
    uuidParam(fields.id, "Cliente"),
    fields.businessSegment ?? "",
  );
  revalidatePath("/customers");
  revalidatePath("/crm/clientes");
  revalidatePath("/tienda");
}

export async function deleteCustomerAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  await deleteCustomer(session.companyId, id);
  revalidatePath("/customers");
  // La acción se dispara desde la ficha del cliente eliminado: esa ruta ya no
  // existe, así que volvemos a la lista para no caer en un 404.
  redirect("/customers?deleted=1");
}

export async function mergeCustomersAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const keepId = uuidParam(String(formData.get("keepId") ?? ""), "Cliente");
  const duplicateId = uuidParam(String(formData.get("duplicateId") ?? ""), "Cliente duplicado");
  await mergeCustomers(session.companyId, keepId, duplicateId);
  revalidatePath("/customers");
  // El duplicado (la ficha desde donde se fusiona) queda eliminado: redirigimos
  // al cliente que se conserva en vez de recargar una ruta inexistente (404).
  redirect(`/customers/${keepId}`);
}
