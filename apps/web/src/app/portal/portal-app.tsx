"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CustomerWhatsAppButton } from "@/components/customer-whatsapp-button";

type Summary = {
  profile: { email: string; displayName: string };
  preferences: { notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean };
  clients: { id: string; name: string; address: string; locality: string }[];
  sales: { id: string; client_id: string; number: string; date: string; status: string; total: string; outstanding: string; invoice_number: string; item_count: number; collection_status: string }[];
  payments: { id: string; client_id: string; sale_id: string; date: string; description: string; amount: string }[];
  invoices: { id: string; client_id: string; date: string; number: string; total: string; kind: "invoice" | "credit_note" | "debit_note" }[];
  balance: number;
};

type CheckoutState = { intentId: string; amount: number; checkoutUrl: string; qrDataUrl: string; status: "created" | "checking" | "pending" | "approved" | "rejected" | "cancelled" };

function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { detectSessionInUrl: true, persistSession: true } }) : null;
}

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function PortalApp() {
  const client = useMemo(() => supabaseBrowser(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accessMode, setAccessMode] = useState<"login" | "link">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState("");
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = client.auth.onAuthStateChange((_event, next) => { setSession(next); });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!session) return;
    const headers = { authorization: `Bearer ${session.access_token}` };
    fetch("/api/portal/checkout/reconcile", { method: "POST", headers, cache: "no-store" })
      .catch(() => null)
      .then(() => fetch("/api/portal/summary", { headers, cache: "no-store" }))
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload.data as Summary; })
      .then((data) => { setSummary(data); setBranch((current) => current || data.clients[0]?.id || ""); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar tu cuenta"))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (!checkout) return;
    window.requestAnimationFrame(() => document.getElementById("resultado-pago")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [checkout]);

  useEffect(() => {
    const intentId = checkout?.intentId;
    if (!intentId || !session) return;
    let active = true;
    const checkPayment = async () => {
      setCheckout((current) => current ? { ...current, status: "checking" } : current);
      try {
        const response = await fetch(`/api/portal/checkout/${encodeURIComponent(intentId)}/status`, { headers: { authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No pudimos verificar el pago");
        if (!active) return;
        const status = payload.data.status as CheckoutState["status"];
        setCheckout((current) => current ? { ...current, status } : current);
        if (["approved", "rejected", "cancelled"].includes(status)) window.clearInterval(timer);
        if (status === "approved") {
          const summaryResponse = await fetch("/api/portal/summary", { headers: { authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
          const summaryPayload = await summaryResponse.json();
          if (active && summaryResponse.ok) { setSummary(summaryPayload.data as Summary); setSelectedSales([]); }
        }
      } catch { if (active) setCheckout((current) => current ? { ...current, status: "pending" } : current); }
    };
    void checkPayment();
    const timer = window.setInterval(checkPayment, 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [checkout?.intentId, session]);

  async function requestAccess(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!client) return;
    const redirectTo = `${window.location.origin}/portal`;
    const { error: authError } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
    if (authError) setError("Ese correo todavía no fue habilitado por Starlim.");
    else setMessage("Te enviamos un enlace seguro. Revisá tu correo para ingresar.");
  }

  async function signIn(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    if (!client) return;
    const { error: authError } = await client.auth.signInWithPassword({ email, password });
    if (authError) setError("Correo o contraseña incorrectos. Si es tu primera vez, pedí un enlace seguro.");
    setLoading(false);
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (!client || newPassword.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    const { error: authError } = await client.auth.updateUser({ password: newPassword });
    if (authError) setError("No pudimos guardar la contraseña. Volvé a intentarlo.");
    else { setNewPassword(""); setMessage("Contraseña guardada. La próxima vez podrás ingresar directamente."); }
  }

  const sales = summary?.sales.filter((sale) => !branch || sale.client_id === branch) ?? [];
  const payments = summary?.payments.filter((payment) => !branch || payment.client_id === branch) ?? [];
  const invoices = summary?.invoices.filter((invoice) => !branch || invoice.client_id === branch) ?? [];
  const repeatableSale = sales.find((sale) => sale.item_count > 0);
  const payableSales = sales.filter((sale) => Number(sale.outstanding) > 0.005 && sale.status === "entregado" && !["pendiente_aprobacion","en_proceso"].includes(sale.collection_status)).toSorted((a, b) => a.date.localeCompare(b.date));

  async function openDocument(path: string) {
    if (!session) return;
    setError("");
    const response = await fetch(path, { headers: { authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); setError(payload.error || "No pudimos abrir el comprobante"); return; }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.target = "_blank"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function createCheckout() {
    if (!session || !branch || !selectedSales.length) return;
    setCheckoutLoading(true); setError(""); setMessage(""); setCheckout(null);
    try {
      const response = await fetch("/api/portal/checkout", { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ clientId: branch, saleIds: selectedSales }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos iniciar el pago");
      setCheckout({ ...payload.data, status: "created" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos iniciar el pago"); }
    finally { setCheckoutLoading(false); }
  }

  async function savePreferences(key: keyof Summary["preferences"], checked: boolean) {
    if (!summary || !session) return;
    const next = { ...summary.preferences, [key]: checked };
    setSummary({ ...summary, preferences: next });
    await fetch("/api/portal/preferences", { method: "PATCH", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ notifyOrders: next.notify_orders, notifyInvoices: next.notify_invoices, notifyOffers: next.notify_offers }) });
  }

  return <main className="min-h-screen bg-[#f3f7fc] text-[#172033]">
    <CustomerWhatsAppButton />
    <header className="border-b border-[#dbe5f1] bg-[#075ac7] px-5 py-4 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between"><Image alt="Starlim" className="h-auto w-32" height={58} src="/starlim-logo-white.png" width={150} /><Link className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold" href="/tienda">Ir a la tienda</Link></div></header>
    {!session ? <section className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-12"><form className="w-full rounded-3xl border border-[#dbe5f1] bg-white p-7 shadow-xl" onSubmit={accessMode === "login" ? signIn : requestAccess}><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Portal de clientes</span><h1 className="mt-2 text-3xl font-black">{accessMode === "login" ? "Ingresar a mi cuenta" : "Recuperar acceso"}</h1><p className="mt-3 text-[#64748b]">{accessMode === "login" ? "Usá el correo habilitado y tu contraseña." : "Te enviaremos un enlace seguro para entrar y crear una contraseña."}</p><label className="mt-6 grid gap-2 text-sm font-bold">Correo electrónico<input autoComplete="email" className="min-h-12 rounded-xl border border-[#cbd8e8] px-4 outline-none focus:border-[#075ac7]" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>{accessMode === "login" ? <label className="mt-4 grid gap-2 text-sm font-bold">Contraseña<input autoComplete="current-password" className="min-h-12 rounded-xl border border-[#cbd8e8] px-4 outline-none focus:border-[#075ac7]" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label> : null}{message ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}<button className="mt-5 min-h-12 w-full rounded-xl bg-[#075ac7] font-extrabold text-white disabled:opacity-50" disabled={loading} type="submit">{accessMode === "login" ? "Ingresar" : "Enviar enlace seguro"}</button><button className="mt-4 w-full text-sm font-bold text-[#075ac7]" onClick={() => { setAccessMode(accessMode === "login" ? "link" : "login"); setError(""); setMessage(""); }} type="button">{accessMode === "login" ? "Primera vez u olvidé mi contraseña" : "Ya tengo contraseña"}</button></form></section>
    : <section className="mx-auto max-w-6xl px-5 py-8">{loading ? <p className="rounded-2xl bg-white p-6 font-bold">Cargando tu cuenta…</p> : error ? <div className="rounded-2xl border border-red-200 bg-white p-6"><p className="font-bold text-red-700">{error}</p><button className="mt-4 text-sm font-bold text-[#075ac7]" onClick={() => client?.auth.signOut()} type="button">Salir</button></div> : summary ? <div className="grid gap-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#075ac7] via-[#096bd7] to-[#0b86df] p-6 text-white shadow-lg sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-extrabold uppercase tracking-[.14em] text-white/75">Mi cuenta Starlim</span><h1 className="mt-2 text-3xl font-black sm:text-4xl">Hola, {summary.profile.displayName || summary.profile.email}</h1><p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">Pedidos, comprobantes y pagos en un solo lugar. Elegí qué necesitás hacer y resolvelo en pocos pasos.</p></div><button className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20" onClick={() => client?.auth.signOut()} type="button">Cerrar sesión</button></div></div>
      {summary.clients.length > 1 ? <label className="grid max-w-md gap-2 text-sm font-bold">Sucursal<select className="min-h-12 rounded-xl border border-[#cbd8e8] bg-white px-4" onChange={(event) => { setBranch(event.target.value); setSelectedSales([]); setCheckout(null); }} value={branch}>{summary.clients.map((item) => <option key={item.id} value={item.id}>{item.name}{item.locality ? ` · ${item.locality}` : ""}</option>)}</select></label> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PortalMetric label="Saldo actual" value={money.format(summary.balance)} /><PortalMetric label="Pedidos visibles" value={String(sales.length)} /><PortalMetric label="Último pedido" value={sales[0]?.date || "Sin pedidos"} /><PortalMetric label="Sucursal" value={summary.clients.find((item) => item.id === branch)?.name || "-"} /></div>
      {message ? <p className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}
      <nav aria-label="Navegación del portal" className="flex gap-2 overflow-x-auto rounded-2xl border border-[#dbe5f1] bg-white p-2 shadow-sm">
        <PortalNavLink href="#pedidos" label="Pedidos" /><PortalNavLink href="#facturas" label="Facturas" /><PortalNavLink href="#pagos" label="Pagos" /><PortalNavLink href="#pagar" label="Pagar ahora" /><PortalNavLink href="#preferencias" label="Preferencias" />
      </nav>
      <div><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Acciones rápidas</span><h2 className="mt-1 text-2xl font-black">¿Qué querés hacer?</h2></div>
      <nav aria-label="Accesos rápidos del portal" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PortalShortcut accent description="Tus productos habituales primero, con buscador y stock disponible." href={`/portal/pedido?clientId=${encodeURIComponent(branch)}`} title="Armar un pedido" />
        {repeatableSale ? <PortalShortcut description="Cargá el último pedido en un carrito editable para agregar o quitar productos." href={`/portal/pedido?clientId=${encodeURIComponent(branch)}&repeatSaleId=${encodeURIComponent(repeatableSale.id)}`} title="Repetir último pedido" /> : <div className="rounded-2xl border border-[#dbe5f1] bg-white p-5 opacity-60"><strong className="text-lg">Repetir último pedido</strong><span className="mt-2 block text-sm text-[#64748b]">Todavía no hay un pedido con productos para repetir.</span></div>}
        <PortalShortcut description="Consultá pedidos anteriores y abrí sus remitos." href="#pedidos" title="Historial de compras" />
        <PortalShortcut description="Visualizá todas las facturas emitidas." href="#facturas" title="Ver facturas" />
        <PortalShortcut description="Revisá únicamente los pagos ya aprobados." href="#pagos" title="Ver pagos" />
        <PortalShortcut description="Elegí facturas pendientes y pagalas en el acto." href="#pagar" title="Pagar facturas" />
      </nav>
      <div className="scroll-mt-5" id="pedidos"><PortalDocumentTable title="Historial de pedidos" empty="Todavía no hay pedidos para esta sucursal." rows={sales.map((sale) => ({ id: sale.id, cells: [sale.date, sale.number || "Pedido", sale.status, money.format(Number(sale.total))] }))} onOpen={(id) => openDocument(`/api/portal/documents/orders/${id}`)} /></div>
      <div className="scroll-mt-5" id="facturas"><PortalDocumentTable title="Facturas y notas fiscales" empty="Todavía no hay comprobantes fiscales emitidos para esta sucursal." rows={invoices.map((invoice) => ({ id: `${invoice.kind}:${invoice.id}`, cells: [invoice.date, `${invoice.kind === "credit_note" ? "Nota de crédito" : invoice.kind === "debit_note" ? "Nota de débito" : "Factura"} ${invoice.number}`, money.format(Number(invoice.total))] }))} onOpen={(key) => { const [kind, id] = key.split(":"); openDocument(kind === "invoice" ? `/api/portal/documents/invoices/${id}` : `/api/portal/documents/notes/${id}`); }} /></div>
      <div className="scroll-mt-5" id="pagos"><PortalTable title="Pagos realizados y registrados" empty="No hay pagos aprobados registrados." rows={payments.map((payment) => [payment.date, payment.description, `Pago ${money.format(Number(payment.amount))}`])} /></div>
      <PaymentCheckout checkout={checkout} loading={checkoutLoading} onCreate={createCheckout} onToggle={(id) => { setCheckout(null); setSelectedSales((current) => { const position = payableSales.findIndex((sale) => sale.id === id); return current.includes(id) ? payableSales.slice(0, position).map((sale) => sale.id) : payableSales.slice(0, position + 1).map((sale) => sale.id); }); }} sales={payableSales} selected={selectedSales} />
      <section className="scroll-mt-5 rounded-2xl border border-[#dbe5f1] bg-white p-5" id="preferencias"><h2 className="text-xl font-black">Avisos por correo</h2><p className="mt-1 text-sm text-[#64748b]">Elegí qué novedades querés recibir en {summary.profile.email}.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Preference checked={summary.preferences.notify_orders} label="Estado de pedidos" onChange={(v) => savePreferences("notify_orders", v)} /><Preference checked={summary.preferences.notify_invoices} label="Facturas y vencimientos" onChange={(v) => savePreferences("notify_invoices", v)} /><Preference checked={summary.preferences.notify_offers} label="Ofertas y novedades" onChange={(v) => savePreferences("notify_offers", v)} /></div></section>
      <section className="rounded-2xl border border-[#dbe5f1] bg-white p-5"><h2 className="text-xl font-black">Contraseña de acceso</h2><p className="mt-1 text-sm text-[#64748b]">Creala después de ingresar por primera vez o cambiala cuando quieras.</p><form className="mt-4 flex flex-wrap gap-3" onSubmit={savePassword}><input autoComplete="new-password" className="min-h-11 min-w-64 flex-1 rounded-xl border border-[#cbd8e8] px-4" minLength={8} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña (mínimo 8 caracteres)" required type="password" value={newPassword} /><button className="min-h-11 rounded-xl bg-[#075ac7] px-5 font-bold text-white" type="submit">Guardar contraseña</button></form></section>
    </div> : null}</section>}
  </main>;
}

function PaymentCheckout({ sales, selected, checkout, loading, onToggle, onCreate }: {
  sales: Summary["sales"];
  selected: string[];
  checkout: CheckoutState | null;
  loading: boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const total = sales.filter((sale) => selected.includes(sale.id)).reduce((sum, sale) => sum + Number(sale.outstanding), 0);
  return <section className="scroll-mt-5 overflow-hidden rounded-2xl border border-[#bcd5ef] bg-white shadow-sm" id="pagar">
    <div className="border-b border-[#e4ebf3] bg-gradient-to-r from-[#eef6ff] to-white px-5 py-5"><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Pago inmediato</span><h2 className="mt-1 text-2xl font-black">Seleccioná qué querés pagar</h2><p className="mt-1 text-sm text-[#64748b]">Los comprobantes se pagan del más antiguo al más reciente. Al elegir uno, también se incluirán los anteriores pendientes.</p></div>
    {sales.length ? <div className="divide-y divide-[#edf1f6]">{sales.slice(0, showAll ? sales.length : 3).map((sale) => {
      const outstanding = Number(sale.outstanding);
      const partiallyPaid = outstanding + 0.005 < Number(sale.total);
      return <label className="grid cursor-pointer items-center gap-3 px-5 py-4 hover:bg-[#f7faff] sm:grid-cols-[auto_1.2fr_1fr_1fr_auto]" key={sale.id}><input checked={selected.includes(sale.id)} className="size-5 accent-[#075ac7]" onChange={() => onToggle(sale.id)} type="checkbox" /><strong>{sale.invoice_number ? `Factura ${sale.invoice_number}` : sale.number || "Pedido"}</strong><span className="text-sm text-[#64748b]">{sale.date}</span><span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${partiallyPaid ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"}`}>{partiallyPaid ? "Pago parcial" : "Impago"}</span>{partiallyPaid ? <small className="mt-1 block font-semibold text-[#64748b]">Original {money.format(Number(sale.total))}</small> : null}</span><strong className="text-red-600">{money.format(outstanding)}</strong></label>;
    })}{sales.length > 3 ? <ShowMoreButton expanded={showAll} hiddenCount={sales.length - 3} onClick={() => setShowAll((value) => !value)} /> : null}</div> : <p className="p-5 font-bold text-emerald-700">No tenés comprobantes pendientes para esta sucursal.</p>}
    {sales.length ? <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e4ebf3] bg-[#f8fbff] p-5"><div><span className="text-sm font-bold text-[#64748b]">Total seleccionado</span><strong className="block text-2xl font-black text-[#172033]">{money.format(total)}</strong></div><button className="min-h-12 rounded-xl bg-[#075ac7] px-6 font-extrabold text-white disabled:opacity-50" disabled={!selected.length || loading} onClick={onCreate} type="button">{loading ? "Preparando pago…" : "Generar QR de Mercado Pago"}</button></div> : null}
    {checkout ? <div aria-live="polite" className="scroll-mt-6 border-t border-[#bcd5ef] p-5" id="resultado-pago" role="status">{checkout.status === "approved" ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-600 text-2xl font-black text-white">✓</span><h3 className="mt-3 text-2xl font-black text-emerald-800">Pago confirmado</h3><p className="mt-2 font-semibold text-emerald-700">Recibimos {money.format(checkout.amount)} y ya actualizamos tu cuenta.</p></div> : <div className="grid items-center gap-5 md:grid-cols-[auto_1fr]"><Image alt="QR para pagar con Mercado Pago" className="mx-auto size-56 rounded-2xl border border-[#dbe5f1]" height={224} src={checkout.qrDataUrl} unoptimized width={224} /><div><h3 className="text-xl font-black">Escaneá y pagá {money.format(checkout.amount)}</h3><div className="mt-4 grid gap-2 text-sm font-bold"><PaymentStep active label="QR generado" /><PaymentStep active={checkout.status !== "created"} label="Verificando acreditación" /><PaymentStep active={false} label="Aplicando a tu cuenta" /></div><p className="mt-4 text-sm text-[#64748b]">{checkout.status === "rejected" ? "Mercado Pago rechazó el pago. Podés intentarlo nuevamente." : "Esta pantalla se actualiza automáticamente. No hace falta recargarla."}</p><a className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-[#009ee3] px-5 font-extrabold text-white" href={checkout.checkoutUrl} rel="noreferrer" target="_blank">Abrir Mercado Pago</a></div></div>}</div> : null}
  </section>;
}

function PaymentStep({ label, active }: { label: string; active: boolean }) { return <span className={`flex items-center gap-2 ${active ? "text-[#075ac7]" : "text-[#94a3b8]"}`}><span className={`size-2.5 rounded-full ${active ? "animate-pulse bg-[#075ac7]" : "bg-[#cbd5e1]"}`} />{label}</span>; }

function PortalMetric({ label, value }: { label: string; value: string }) { const pending = label === "Saldo actual" && value !== money.format(0); return <div className="rounded-2xl border border-[#dbe5f1] bg-white p-5 shadow-sm"><span className="text-xs font-extrabold uppercase tracking-[.08em] text-[#64748b]">{label}</span><strong className={`mt-2 block text-2xl font-black ${pending ? "text-red-600" : ""}`}>{value}</strong>{pending ? <span className="mt-1 block text-xs font-bold text-red-600">Pendiente de pago</span> : null}</div>; }
function Preference({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dbe5f1] p-4 font-bold"><input checked={checked} className="size-5 accent-[#075ac7]" onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>; }
function PortalTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) { const [showAll, setShowAll] = useState(false); return <section className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white shadow-sm"><RecordHeader count={rows.length} title={title} />{rows.length ? <div className="divide-y divide-[#edf1f6]">{rows.slice(0, showAll ? rows.length : 3).map((row, index) => <div className="grid gap-1 px-5 py-4 transition hover:bg-[#f8fbff] sm:grid-cols-4" key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => { const normalized = cell.toLocaleLowerCase("es"); const tone = normalized.includes("entregado") ? "font-bold text-emerald-600" : normalized.startsWith("cargo ") ? "font-bold text-red-600" : cellIndex === 1 ? "font-bold" : "text-sm text-[#53657a]"; return <span className={tone} key={cellIndex}>{cell}</span>; })}</div>)}{rows.length > 3 ? <ShowMoreButton expanded={showAll} hiddenCount={rows.length - 3} onClick={() => setShowAll((value) => !value)} /> : null}</div> : <p className="p-5 text-[#64748b]">{empty}</p>}</section>; }
function PortalDocumentTable({ title, rows, empty, onOpen }: { title: string; rows: { id: string; cells: string[] }[]; empty: string; onOpen: (id: string) => void }) { const [showAll, setShowAll] = useState(false); return <section className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white shadow-sm"><RecordHeader count={rows.length} title={title} />{rows.length ? <div className="divide-y divide-[#edf1f6]">{rows.slice(0, showAll ? rows.length : 3).map((row) => <div className="grid items-center gap-x-5 gap-y-3 px-5 py-4 transition hover:bg-[#f8fbff] sm:grid-cols-[minmax(110px,.8fr)_minmax(220px,1.5fr)_minmax(100px,.7fr)_minmax(120px,.8fr)_auto]" key={row.id}>{row.cells.map((cell, index) => <span className={`${index === 1 ? "font-bold" : cell.toLowerCase().includes("entregado") ? "font-bold text-emerald-600" : "text-sm text-[#53657a]"} ${index === row.cells.length - 1 ? "sm:text-right" : ""}`} key={index}>{cell}</span>)}<button className="min-h-10 rounded-lg border border-[#bcd5ef] px-4 text-sm font-bold text-[#075ac7] transition hover:border-[#075ac7] hover:bg-[#eef6ff]" onClick={() => onOpen(row.id)} type="button">Ver PDF</button></div>)}{rows.length > 3 ? <ShowMoreButton expanded={showAll} hiddenCount={rows.length - 3} onClick={() => setShowAll((value) => !value)} /> : null}</div> : <p className="p-5 text-[#64748b]">{empty}</p>}</section>; }
function PortalShortcut({ title, description, href, accent = false }: { title: string; description: string; href: string; accent?: boolean }) { return <Link className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 ${accent ? "border-[#075ac7] bg-[#075ac7] text-white" : "border-[#bcd5ef] bg-white hover:border-[#075ac7]"}`} href={href}><strong className="text-lg">{title}</strong><span className={`mt-2 block text-sm ${accent ? "text-white/75" : "text-[#64748b]"}`}>{description}</span></Link>; }
function PortalNavLink({ href, label }: { href: string; label: string }) { return <a className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold text-[#53657a] transition hover:bg-[#eef6ff] hover:text-[#075ac7]" href={href}>{label}</a>; }
function RecordHeader({ title, count }: { title: string; count: number }) { return <div className="flex items-center justify-between gap-3 border-b border-[#e4ebf3] px-5 py-4"><h2 className="text-xl font-black">{title}</h2><span className="rounded-full bg-[#eef6ff] px-3 py-1 text-xs font-extrabold text-[#075ac7]">{count} {count === 1 ? "registro" : "registros"}</span></div>; }
function ShowMoreButton({ expanded, hiddenCount, onClick }: { expanded: boolean; hiddenCount: number; onClick: () => void }) { return <button className="flex min-h-12 w-full items-center justify-center bg-[#f8fbff] px-5 text-sm font-extrabold text-[#075ac7] transition hover:bg-[#eef6ff]" onClick={onClick} type="button">{expanded ? "Ver menos" : `Ver ${hiddenCount} más`}</button>; }
