"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Summary = {
  profile: { email: string; displayName: string };
  preferences: { notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean };
  clients: { id: string; name: string; address: string; locality: string }[];
  sales: { id: string; client_id: string; number: string; date: string; status: string; total: string; outstanding: string; invoice_number: string; item_count: number; collection_status: string }[];
  payments: { id: string; client_id: string; sale_id: string; date: string; description: string; amount: string }[];
  invoices: { id: string; client_id: string; date: string; number: string; total: string }[];
  balance: number;
};

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
  const [checkout, setCheckout] = useState<{ amount: number; checkoutUrl: string; qrDataUrl: string } | null>(null);

  useEffect(() => {
    if (!client) return;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = client.auth.onAuthStateChange((_event, next) => { setSession(next); });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/portal/summary", { headers: { authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload.data as Summary; })
      .then((data) => { setSummary(data); setBranch((current) => current || data.clients[0]?.id || ""); setError(""); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar tu cuenta"))
      .finally(() => setLoading(false));
  }, [session]);

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

  async function repeatLastOrder() {
    if (!session || !repeatableSale) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/portal/repeat", { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ saleId: repeatableSale.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos repetir el pedido");
      setMessage(`Solicitud ${payload.data.quoteNumber} creada con los precios del pedido original. Starlim la revisará antes de confirmarla.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos repetir el pedido"); }
    finally { setLoading(false); }
  }

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
    setLoading(true); setError(""); setMessage(""); setCheckout(null);
    try {
      const response = await fetch("/api/portal/checkout", { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ clientId: branch, saleIds: selectedSales }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos iniciar el pago");
      setCheckout(payload.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos iniciar el pago"); }
    finally { setLoading(false); }
  }

  async function savePreferences(key: keyof Summary["preferences"], checked: boolean) {
    if (!summary || !session) return;
    const next = { ...summary.preferences, [key]: checked };
    setSummary({ ...summary, preferences: next });
    await fetch("/api/portal/preferences", { method: "PATCH", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ notifyOrders: next.notify_orders, notifyInvoices: next.notify_invoices, notifyOffers: next.notify_offers }) });
  }

  return <main className="min-h-screen bg-[#f3f7fc] text-[#172033]">
    <header className="border-b border-[#dbe5f1] bg-[#075ac7] px-5 py-4 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between"><Image alt="Starlim" className="h-auto w-32" height={58} src="/starlim-logo-white.png" width={150} /><Link className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold" href="/tienda">Ir a la tienda</Link></div></header>
    {!session ? <section className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-12"><form className="w-full rounded-3xl border border-[#dbe5f1] bg-white p-7 shadow-xl" onSubmit={accessMode === "login" ? signIn : requestAccess}><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Portal de clientes</span><h1 className="mt-2 text-3xl font-black">{accessMode === "login" ? "Ingresar a mi cuenta" : "Recuperar acceso"}</h1><p className="mt-3 text-[#64748b]">{accessMode === "login" ? "Usá el correo habilitado y tu contraseña." : "Te enviaremos un enlace seguro para entrar y crear una contraseña."}</p><label className="mt-6 grid gap-2 text-sm font-bold">Correo electrónico<input autoComplete="email" className="min-h-12 rounded-xl border border-[#cbd8e8] px-4 outline-none focus:border-[#075ac7]" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>{accessMode === "login" ? <label className="mt-4 grid gap-2 text-sm font-bold">Contraseña<input autoComplete="current-password" className="min-h-12 rounded-xl border border-[#cbd8e8] px-4 outline-none focus:border-[#075ac7]" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label> : null}{message ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}<button className="mt-5 min-h-12 w-full rounded-xl bg-[#075ac7] font-extrabold text-white disabled:opacity-50" disabled={loading} type="submit">{accessMode === "login" ? "Ingresar" : "Enviar enlace seguro"}</button><button className="mt-4 w-full text-sm font-bold text-[#075ac7]" onClick={() => { setAccessMode(accessMode === "login" ? "link" : "login"); setError(""); setMessage(""); }} type="button">{accessMode === "login" ? "Primera vez u olvidé mi contraseña" : "Ya tengo contraseña"}</button></form></section>
    : <section className="mx-auto max-w-6xl px-5 py-8">{loading ? <p className="rounded-2xl bg-white p-6 font-bold">Cargando tu cuenta…</p> : error ? <div className="rounded-2xl border border-red-200 bg-white p-6"><p className="font-bold text-red-700">{error}</p><button className="mt-4 text-sm font-bold text-[#075ac7]" onClick={() => client?.auth.signOut()} type="button">Salir</button></div> : summary ? <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Mi cuenta Starlim</span><h1 className="mt-1 text-3xl font-black">Hola, {summary.profile.displayName || summary.profile.email}</h1></div><button className="text-sm font-bold text-[#075ac7]" onClick={() => client?.auth.signOut()} type="button">Cerrar sesión</button></div>
      {summary.clients.length > 1 ? <label className="grid max-w-md gap-2 text-sm font-bold">Sucursal<select className="min-h-12 rounded-xl border border-[#cbd8e8] bg-white px-4" onChange={(event) => { setBranch(event.target.value); setSelectedSales([]); setCheckout(null); }} value={branch}>{summary.clients.map((item) => <option key={item.id} value={item.id}>{item.name}{item.locality ? ` · ${item.locality}` : ""}</option>)}</select></label> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PortalMetric label="Saldo actual" value={money.format(summary.balance)} /><PortalMetric label="Pedidos visibles" value={String(sales.length)} /><PortalMetric label="Último pedido" value={sales[0]?.date || "Sin pedidos"} /><PortalMetric label="Sucursal" value={summary.clients.find((item) => item.id === branch)?.name || "-"} /></div>
      {message ? <p className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}
      <nav aria-label="Accesos rápidos del portal" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PortalShortcut accent description="Elegí productos del catálogo y envialos a Starlim." href={`/tienda?portalClient=${encodeURIComponent(branch)}`} title="Armar un pedido" />
        <button className="rounded-2xl border border-[#bcd5ef] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#075ac7] disabled:opacity-50" disabled={!repeatableSale || loading} onClick={repeatLastOrder} type="button"><strong className="text-lg">Repetir último pedido</strong><span className="mt-2 block text-sm text-[#64748b]">Recreá el último pedido que tenga productos registrados.</span></button>
        <PortalShortcut description="Consultá pedidos anteriores y abrí sus remitos." href="#pedidos" title="Historial de compras" />
        <PortalShortcut description="Visualizá todas las facturas emitidas." href="#facturas" title="Ver facturas" />
        <PortalShortcut description="Revisá únicamente los pagos ya aprobados." href="#pagos" title="Ver pagos" />
        <PortalShortcut description="Elegí facturas pendientes y pagalas en el acto." href="#pagar" title="Pagar facturas" />
      </nav>
      <div className="scroll-mt-5" id="pedidos"><PortalDocumentTable title="Historial de pedidos" empty="Todavía no hay pedidos para esta sucursal." rows={sales.map((sale) => ({ id: sale.id, cells: [sale.date, sale.number || "Pedido", sale.status, money.format(Number(sale.total))] }))} onOpen={(id) => openDocument(`/api/portal/documents/orders/${id}`)} /></div>
      <div className="scroll-mt-5" id="facturas"><PortalDocumentTable title="Facturas" empty="Todavía no hay facturas emitidas para esta sucursal." rows={invoices.map((invoice) => ({ id: invoice.id, cells: [invoice.date, `Factura ${invoice.number}`, money.format(Number(invoice.total))] }))} onOpen={(id) => openDocument(`/api/portal/documents/invoices/${id}`)} /></div>
      <div className="scroll-mt-5" id="pagos"><PortalTable title="Pagos realizados y registrados" empty="No hay pagos aprobados registrados." rows={payments.map((payment) => [payment.date, payment.description, `Pago ${money.format(Number(payment.amount))}`])} /></div>
      <PaymentCheckout checkout={checkout} loading={loading} onCreate={createCheckout} onToggle={(id) => { setCheckout(null); setSelectedSales((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }} sales={sales.filter((sale) => Number(sale.outstanding) > 0.005 && !["pendiente_aprobacion","en_proceso"].includes(sale.collection_status))} selected={selectedSales} />
      <section className="rounded-2xl border border-[#dbe5f1] bg-white p-5"><h2 className="text-xl font-black">Avisos por correo</h2><p className="mt-1 text-sm text-[#64748b]">Elegí qué novedades querés recibir en {summary.profile.email}.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Preference checked={summary.preferences.notify_orders} label="Estado de pedidos" onChange={(v) => savePreferences("notify_orders", v)} /><Preference checked={summary.preferences.notify_invoices} label="Facturas y vencimientos" onChange={(v) => savePreferences("notify_invoices", v)} /><Preference checked={summary.preferences.notify_offers} label="Ofertas y novedades" onChange={(v) => savePreferences("notify_offers", v)} /></div></section>
      <section className="rounded-2xl border border-[#dbe5f1] bg-white p-5"><h2 className="text-xl font-black">Contraseña de acceso</h2><p className="mt-1 text-sm text-[#64748b]">Creala después de ingresar por primera vez o cambiala cuando quieras.</p><form className="mt-4 flex flex-wrap gap-3" onSubmit={savePassword}><input autoComplete="new-password" className="min-h-11 min-w-64 flex-1 rounded-xl border border-[#cbd8e8] px-4" minLength={8} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña (mínimo 8 caracteres)" required type="password" value={newPassword} /><button className="min-h-11 rounded-xl bg-[#075ac7] px-5 font-bold text-white" type="submit">Guardar contraseña</button></form></section>
    </div> : null}</section>}
  </main>;
}

function PaymentCheckout({ sales, selected, checkout, loading, onToggle, onCreate }: {
  sales: Summary["sales"];
  selected: string[];
  checkout: { amount: number; checkoutUrl: string; qrDataUrl: string } | null;
  loading: boolean;
  onToggle: (id: string) => void;
  onCreate: () => void;
}) {
  const total = sales.filter((sale) => selected.includes(sale.id)).reduce((sum, sale) => sum + Number(sale.outstanding), 0);
  return <section className="scroll-mt-5 overflow-hidden rounded-2xl border border-[#bcd5ef] bg-white shadow-sm" id="pagar">
    <div className="border-b border-[#e4ebf3] bg-gradient-to-r from-[#eef6ff] to-white px-5 py-5"><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Pago inmediato</span><h2 className="mt-1 text-2xl font-black">Seleccioná qué querés pagar</h2><p className="mt-1 text-sm text-[#64748b]">Podés combinar una o más facturas o pedidos pendientes. El pago se asentará cuando Mercado Pago confirme la acreditación.</p></div>
    {sales.length ? <div className="divide-y divide-[#edf1f6]">{sales.map((sale) => {
      const outstanding = Number(sale.outstanding);
      const partiallyPaid = outstanding + 0.005 < Number(sale.total);
      return <label className="grid cursor-pointer items-center gap-3 px-5 py-4 hover:bg-[#f7faff] sm:grid-cols-[auto_1.2fr_1fr_1fr_auto]" key={sale.id}><input checked={selected.includes(sale.id)} className="size-5 accent-[#075ac7]" onChange={() => onToggle(sale.id)} type="checkbox" /><strong>{sale.invoice_number ? `Factura ${sale.invoice_number}` : sale.number || "Pedido"}</strong><span className="text-sm text-[#64748b]">{sale.date}</span><span><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${partiallyPaid ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"}`}>{partiallyPaid ? "Pago parcial" : "Impago"}</span>{partiallyPaid ? <small className="mt-1 block font-semibold text-[#64748b]">Original {money.format(Number(sale.total))}</small> : null}</span><strong className="text-red-600">{money.format(outstanding)}</strong></label>;
    })}</div> : <p className="p-5 font-bold text-emerald-700">No tenés comprobantes pendientes para esta sucursal.</p>}
    {sales.length ? <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#e4ebf3] bg-[#f8fbff] p-5"><div><span className="text-sm font-bold text-[#64748b]">Total seleccionado</span><strong className="block text-2xl font-black text-[#172033]">{money.format(total)}</strong></div><button className="min-h-12 rounded-xl bg-[#075ac7] px-6 font-extrabold text-white disabled:opacity-50" disabled={!selected.length || loading} onClick={onCreate} type="button">{loading ? "Preparando pago…" : "Generar QR de Mercado Pago"}</button></div> : null}
    {checkout ? <div className="grid items-center gap-5 border-t border-[#bcd5ef] p-5 md:grid-cols-[auto_1fr]"><Image alt="QR para pagar con Mercado Pago" className="mx-auto size-56 rounded-2xl border border-[#dbe5f1]" height={224} src={checkout.qrDataUrl} unoptimized width={224} /><div><h3 className="text-xl font-black">Escaneá y pagá {money.format(checkout.amount)}</h3><p className="mt-2 text-sm text-[#64748b]">Al acreditarse, el pago se aplicará automáticamente a los comprobantes elegidos.</p><a className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-[#009ee3] px-5 font-extrabold text-white" href={checkout.checkoutUrl} rel="noreferrer" target="_blank">Abrir Mercado Pago</a></div></div> : null}
  </section>;
}

function PortalMetric({ label, value }: { label: string; value: string }) { const pending = label === "Saldo actual" && value !== money.format(0); return <div className="rounded-2xl border border-[#dbe5f1] bg-white p-5 shadow-sm"><span className="text-xs font-extrabold uppercase tracking-[.08em] text-[#64748b]">{label}</span><strong className={`mt-2 block text-2xl font-black ${pending ? "text-red-600" : ""}`}>{value}</strong>{pending ? <span className="mt-1 block text-xs font-bold text-red-600">Pendiente de pago</span> : null}</div>; }
function Preference({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dbe5f1] p-4 font-bold"><input checked={checked} className="size-5 accent-[#075ac7]" onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>; }
function PortalTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) { return <section className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white"><h2 className="border-b border-[#e4ebf3] px-5 py-4 text-xl font-black">{title}</h2>{rows.length ? <div className="divide-y divide-[#edf1f6]">{rows.slice(0, 20).map((row, index) => <div className="grid gap-1 px-5 py-4 sm:grid-cols-4" key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => { const normalized = cell.toLocaleLowerCase("es"); const tone = normalized.includes("entregado") ? "font-bold text-emerald-600" : normalized.startsWith("cargo ") ? "font-bold text-red-600" : cellIndex === 1 ? "font-bold" : "text-sm text-[#53657a]"; return <span className={tone} key={cellIndex}>{cell}</span>; })}</div>)}</div> : <p className="p-5 text-[#64748b]">{empty}</p>}</section>; }
function PortalDocumentTable({ title, rows, empty, onOpen }: { title: string; rows: { id: string; cells: string[] }[]; empty: string; onOpen: (id: string) => void }) { return <section className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white"><h2 className="border-b border-[#e4ebf3] px-5 py-4 text-xl font-black">{title}</h2>{rows.length ? <div className="divide-y divide-[#edf1f6]">{rows.slice(0, 30).map((row) => <div className="grid items-center gap-2 px-5 py-4 sm:grid-cols-[1fr_1.4fr_1fr_auto]" key={row.id}>{row.cells.map((cell, index) => <span className={index === 1 ? "font-bold" : cell.toLowerCase().includes("entregado") ? "font-bold text-emerald-600" : "text-sm text-[#53657a]"} key={index}>{cell}</span>)}<button className="rounded-lg border border-[#bcd5ef] px-3 py-2 text-sm font-bold text-[#075ac7]" onClick={() => onOpen(row.id)} type="button">Ver PDF</button></div>)}</div> : <p className="p-5 text-[#64748b]">{empty}</p>}</section>; }
function PortalShortcut({ title, description, href, accent = false }: { title: string; description: string; href: string; accent?: boolean }) { return <Link className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 ${accent ? "border-[#075ac7] bg-[#075ac7] text-white" : "border-[#bcd5ef] bg-white hover:border-[#075ac7]"}`} href={href}><strong className="text-lg">{title}</strong><span className={`mt-2 block text-sm ${accent ? "text-white/75" : "text-[#64748b]"}`}>{description}</span></Link>; }
