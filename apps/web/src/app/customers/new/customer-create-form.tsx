"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CUSTOMER_BUSINESS_SEGMENTS } from "@/lib/customer-segments";
import { CUSTOMER_RECEIPT_OPTIONS } from "@/lib/customer-receipt-types";
import { FISCAL_CONDITION_OPTIONS } from "@/lib/fiscal-conditions";

type PriceList = { id: number | string; name: string; active?: boolean };
type Vendor = { id: string; name: string };

async function loadOptions<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) return [];
  const payload = await response.json() as { data?: T[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

export function CustomerCreateForm() {
  const router = useRouter();
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      loadOptions<PriceList>("/api/pricing/price-lists?includeInactive=false"),
      loadOptions<Vendor>("/api/vendors"),
    ]).then(([lists, people]) => {
      if (!active) return;
      setPriceLists(lists.filter((list) => list.active !== false));
      setVendors(people.filter((person) => person.name));
      setLoadingOptions(false);
    }).catch(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo crear el cliente");
      router.push("/customers?created=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el cliente");
      setSubmitting(false);
    }
  }

  const input = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const label = "grid gap-1.5 text-sm font-semibold text-slate-800";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Clientes</p><h1 className="text-2xl font-bold text-slate-950">Nuevo cliente</h1><p className="mt-1 text-sm text-slate-500">Completá los datos disponibles. Luego podrás ampliar la ficha.</p></div>
          <Link className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50" href="/customers">Volver a clientes</Link>
        </header>
        <form className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className={label}>Cliente *<input autoFocus className={input} name="name" required /></label>
            <label className={label}>Razón social<input className={input} name="businessName" /></label>
            <label className={label}>CUIT/DNI<input className={input} name="taxId" /></label>
            <label className={label}>Condición IVA<select className={input} defaultValue="Consumidor Final" name="vatCondition">{FISCAL_CONDITION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className={label}>Comprobante *<select className={input} defaultValue="" name="receiptType" required><option disabled value="">Seleccionar comprobante</option>{CUSTOMER_RECEIPT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className={label}>Rubro comercial<select className={input} defaultValue="" name="businessSegment"><option value="">Sin clasificar</option>{CUSTOMER_BUSINESS_SEGMENTS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className={label}>Teléfono<input className={input} name="phone" /></label>
            <label className={label}>Lista de precios<select className={input} defaultValue="" disabled={loadingOptions} name="priceList"><option value="">{loadingOptions ? "Cargando listas…" : "Seleccionar lista"}</option>{priceLists.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></label>
            <label className={label}>Vendedor<select className={input} defaultValue="" disabled={loadingOptions} name="seller"><option value="">{loadingOptions ? "Cargando vendedores…" : "Seleccionar vendedor"}</option>{vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></label>
            <label className={label}>Ciudad<input className={input} name="city" /></label>
            <label className={label}>Provincia<input className={input} name="province" /></label>
            <label className={label}>Dirección<input className={input} name="address" /></label>
          </div>
          <label className={label}>Observación<textarea className={`${input} min-h-24 py-3`} name="observation" /></label>
          <div className="flex justify-end"><button className="min-h-11 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60" disabled={submitting} type="submit">{submitting ? "Creando cliente…" : "Crear cliente"}</button></div>
        </form>
      </div>
    </main>
  );
}
