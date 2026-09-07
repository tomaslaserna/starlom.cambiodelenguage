"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Summary = {
  profile: { email: string; displayName: string };
  preferences: { notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean };
  clients: { id: string; name: string; address: string; locality: string }[];
  sales: { id: string; client_id: string; number: string; date: string; status: string; total: string }[];
  movements: { id: string; client_id: string; date: string; description: string; debit: string; credit: string }[];
  balance: number;
};

function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { detectSessionInUrl: true, persistSession: true } }) : null;
}

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function PortalApp() {
  const client = useMemo(supabaseBrowser, []);
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState("");

  useEffect(() => {
    if (!client) { setError("El acceso de clientes todavía no está configurado."); setLoading(false); return; }
    client.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = client.auth.onAuthStateChange((_event, next) => { setSession(next); });
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!session) { setSummary(null); return; }
    setLoading(true);
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

  const sales = summary?.sales.filter((sale) => !branch || sale.client_id === branch) ?? [];
  const movements = summary?.movements.filter((movement) => !branch || movement.client_id === branch) ?? [];

  async function repeatLastOrder() {
    if (!session || !sales[0]) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/portal/repeat", { method: "POST", headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ saleId: sales[0].id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos repetir el pedido");
      setMessage(`Solicitud ${payload.data.quoteNumber} creada con los precios del pedido original. Starlim la revisará antes de confirmarla.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos repetir el pedido"); }
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
    {!session ? <section className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-12"><form className="w-full rounded-3xl border border-[#dbe5f1] bg-white p-7 shadow-xl" onSubmit={requestAccess}><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Portal de clientes</span><h1 className="mt-2 text-3xl font-black">Todo lo tuyo, en un lugar</h1><p className="mt-3 text-[#64748b]">Ingresá con el correo habilitado por Starlim. Te enviaremos un enlace seguro, sin contraseña.</p><label className="mt-6 grid gap-2 text-sm font-bold">Correo electrónico<input className="min-h-12 rounded-xl border border-[#cbd8e8] px-4 outline-none focus:border-[#075ac7]" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>{message ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p> : null}{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}<button className="mt-5 min-h-12 w-full rounded-xl bg-[#075ac7] font-extrabold text-white" type="submit">Enviarme acceso</button></form></section>
    : <section className="mx-auto max-w-6xl px-5 py-8">{loading ? <p className="rounded-2xl bg-white p-6 font-bold">Cargando tu cuenta…</p> : error ? <div className="rounded-2xl border border-red-200 bg-white p-6"><p className="font-bold text-red-700">{error}</p><button className="mt-4 text-sm font-bold text-[#075ac7]" onClick={() => client?.auth.signOut()} type="button">Salir</button></div> : summary ? <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#075ac7]">Mi cuenta Starlim</span><h1 className="mt-1 text-3xl font-black">Hola, {summary.profile.displayName || summary.profile.email}</h1></div><button className="text-sm font-bold text-[#075ac7]" onClick={() => client?.auth.signOut()} type="button">Cerrar sesión</button></div>
      {summary.clients.length > 1 ? <label className="grid max-w-md gap-2 text-sm font-bold">Sucursal<select className="min-h-12 rounded-xl border border-[#cbd8e8] bg-white px-4" onChange={(event) => setBranch(event.target.value)} value={branch}>{summary.clients.map((item) => <option key={item.id} value={item.id}>{item.name}{item.locality ? ` · ${item.locality}` : ""}</option>)}</select></label> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PortalMetric label="Saldo actual" value={money.format(summary.balance)} /><PortalMetric label="Pedidos visibles" value={String(sales.length)} /><PortalMetric label="Último pedido" value={sales[0]?.date || "Sin pedidos"} /><PortalMetric label="Sucursal" value={summary.clients.find((item) => item.id === branch)?.name || "-"} /></div>
      {message ? <p className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-700">{message}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2"><Link className="rounded-2xl bg-[#075ac7] p-6 text-white shadow-lg" href={`/tienda?portalClient=${encodeURIComponent(branch)}`}><strong className="text-xl">Armar un pedido</strong><span className="mt-2 block text-white/75">Elegí productos del catálogo y envialos asociado a esta sucursal.</span></Link><button className="rounded-2xl border border-[#bcd5ef] bg-white p-6 text-left disabled:opacity-50" disabled={!sales.length || loading} onClick={repeatLastOrder} type="button"><strong className="text-xl">Repetir último pedido</strong><span className="mt-2 block text-[#64748b]">Crea una solicitud con los mismos artículos, cantidades y precios congelados.</span></button></div>
      <PortalTable title="Historial de pedidos" empty="Todavía no hay pedidos para esta sucursal." rows={sales.map((sale) => [sale.date, sale.number || "Pedido", sale.status, money.format(Number(sale.total))])} />
      <PortalTable title="Cuenta corriente y pagos" empty="No hay movimientos registrados." rows={movements.map((movement) => [movement.date, movement.description, Number(movement.debit) ? `Cargo ${money.format(Number(movement.debit))}` : `Pago ${money.format(Number(movement.credit))}`])} />
      <section className="rounded-2xl border border-[#dbe5f1] bg-white p-5"><h2 className="text-xl font-black">Avisos por correo</h2><p className="mt-1 text-sm text-[#64748b]">Elegí qué novedades querés recibir en {summary.profile.email}.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><Preference checked={summary.preferences.notify_orders} label="Estado de pedidos" onChange={(v) => savePreferences("notify_orders", v)} /><Preference checked={summary.preferences.notify_invoices} label="Facturas y vencimientos" onChange={(v) => savePreferences("notify_invoices", v)} /><Preference checked={summary.preferences.notify_offers} label="Ofertas y novedades" onChange={(v) => savePreferences("notify_offers", v)} /></div></section>
    </div> : null}</section>}
  </main>;
}

function PortalMetric({ label, value }: { label: string; value: string }) { const pending = label === "Saldo actual" && value !== money.format(0); return <div className="rounded-2xl border border-[#dbe5f1] bg-white p-5 shadow-sm"><span className="text-xs font-extrabold uppercase tracking-[.08em] text-[#64748b]">{label}</span><strong className={`mt-2 block text-2xl font-black ${pending ? "text-red-600" : ""}`}>{value}</strong>{pending ? <span className="mt-1 block text-xs font-bold text-red-600">Pendiente de pago</span> : null}</div>; }
function Preference({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dbe5f1] p-4 font-bold"><input checked={checked} className="size-5 accent-[#075ac7]" onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>; }
function PortalTable({ title, rows, empty }: { title: string; rows: string[][]; empty: string }) { return <section className="overflow-hidden rounded-2xl border border-[#dbe5f1] bg-white"><h2 className="border-b border-[#e4ebf3] px-5 py-4 text-xl font-black">{title}</h2>{rows.length ? <div className="divide-y divide-[#edf1f6]">{rows.slice(0, 20).map((row, index) => <div className="grid gap-1 px-5 py-4 sm:grid-cols-4" key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => { const normalized = cell.toLocaleLowerCase("es"); const tone = normalized.includes("entregado") ? "font-bold text-emerald-600" : normalized.startsWith("cargo ") ? "font-bold text-red-600" : cellIndex === 1 ? "font-bold" : "text-sm text-[#53657a]"; return <span className={tone} key={cellIndex}>{cell}</span>; })}</div>)}</div> : <p className="p-5 text-[#64748b]">{empty}</p>}</section>; }
