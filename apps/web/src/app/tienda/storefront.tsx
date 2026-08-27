"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";

type Product = { id: string; name: string; code: string; category: string; brand: string; imageUrl: string | null };
type Location = { address: string; city: string; province: string; latitude: string; longitude: string };
type SectionKey = "all" | "papeleria" | "descartables" | "liquidos" | "articulos" | "textil";

const sectionFilters: { key: SectionKey; label: string; terms: string[] }[] = [
  { key: "all", label: "Todos", terms: [] },
  { key: "papeleria", label: "Papelería", terms: ["papel", "bobina", "servilleta", "higienico", "toalla"] },
  { key: "descartables", label: "Descartables", terms: ["descartable", "vaso", "plato", "cubierto", "bandeja", "film"] },
  { key: "liquidos", label: "Líquidos", terms: ["liquido", "detergente", "desinfectante", "lavandina", "limpiador", "jabon"] },
  { key: "articulos", label: "Artículos", terms: ["articulo", "accesorio", "escoba", "cepillo", "balde", "mopa", "guante"] },
  { key: "textil", label: "Textil", terms: ["textil", "trapo", "rejilla", "paño", "microfibra"] },
];

const fieldClass = "min-h-11 rounded-[9px] border border-[#cbd8e8] px-3 font-medium outline-none focus:border-[#075ac7]";

export function Storefront({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [section, setSection] = useState<SectionKey>("all");
  const [step, setStep] = useState<"catalog" | "checkout" | "success">("catalog");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<Location>({ address: "", city: "", province: "", latitude: "", longitude: "" });
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const needle = query.trim().toLocaleLowerCase("es");
    const haystack = `${product.name} ${product.code} ${product.category} ${product.brand}`.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const sectionTerms = sectionFilters.find((item) => item.key === section)?.terms ?? [];
    return (!category || product.category === category)
      && (!brand || product.brand === brand)
      && (section === "all" || sectionTerms.some((term) => haystack.includes(term)))
      && (!needle || haystack.includes(needle.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  }), [products, query, category, brand, section]);
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of filtered) {
      const label = product.category || "Otros artículos";
      groups.set(label, [...(groups.get(label) ?? []), product]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [filtered]);
  const selected = products.filter((product) => (cart[product.id] ?? 0) > 0);
  const totalUnits = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const mapUrl = location.latitude && location.longitude
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(location.longitude) - .01}%2C${Number(location.latitude) - .01}%2C${Number(location.longitude) + .01}%2C${Number(location.latitude) + .01}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`
    : "https://www.openstreetmap.org/export/embed.html?bbox=-64.35%2C-31.55%2C-64.05%2C-31.25&layer=mapnik";

  function changeQuantity(id: string, delta: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(9999, (current[id] ?? 0) + delta)) }));
  }

  function goToCheckout() {
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function locate() {
    setError(""); setLocating(true);
    if (!navigator.geolocation) { setError("Tu navegador no permite obtener la ubicación. Podés completar la dirección manualmente."); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const response = await fetch(`/api/storefront/reverse-geocode?lat=${coords.latitude}&lon=${coords.longitude}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo obtener la dirección");
        setLocation({ address: payload.data.address, city: payload.data.city, province: payload.data.province, latitude: String(coords.latitude), longitude: String(coords.longitude) });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo obtener la dirección"); }
      finally { setLocating(false); }
    }, () => { setError("No pudimos acceder a tu ubicación. Completá la dirección manualmente."); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/storefront/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), ...location, items: selected.map((product) => ({ productId: product.id, quantity: cart[product.id] })) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos enviar el pedido");
      setStep("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos enviar el pedido"); }
    finally { setSubmitting(false); }
  }

  if (step === "success") return <section className="mx-auto grid min-h-[520px] max-w-3xl place-items-center px-5 py-16 text-center"><div className="rounded-[22px] border border-[#b8e3cf] bg-white p-8 shadow-xl sm:p-12"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f8ef] text-3xl text-[#07834f]">✓</span><h2 className="mt-6 text-3xl font-extrabold">Hemos recibido tu pedido</h2><p className="mt-4 text-lg leading-7 text-[#5b6b82]">A la brevedad un comercial se contactará con usted.</p><button className="mt-8 rounded-[11px] bg-[#075ac7] px-6 py-3 font-bold text-white" onClick={() => { setCart({}); setStep("catalog"); }} type="button">Volver a la tienda</button></div></section>;

  return <section className="mx-auto max-w-[1380px] px-4 py-8 sm:px-8">
    {step === "catalog" ? <>
      <div className="rounded-[16px] border border-[#dbe5f1] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf2] pb-4"><div><strong className="block text-lg">+{products.length} artículos en lista</strong><span className="text-sm font-medium text-[#64748b]">{filtered.length} visibles con los filtros actuales</span></div><button className="rounded-[11px] bg-[#ffb74d] px-5 py-3 font-extrabold text-[#173052] shadow-sm disabled:opacity-50" disabled={!totalUnits} onClick={goToCheckout} type="button">Continuar · {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}</button></div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Secciones de productos">{sectionFilters.map((item) => <button aria-pressed={section === item.key} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${section === item.key ? "bg-[#075ac7] text-white" : "border border-[#cbd8e8] text-[#315170] hover:bg-[#f4f8fc]"}`} key={item.key} onClick={() => setSection(item.key)} type="button">{item.label}</button>)}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_230px_230px]"><input className={fieldClass} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, código, marca o categoría" type="search" value={query} /><select className={`${fieldClass} bg-white`} onChange={(event) => setCategory(event.target.value)} value={category}><option value="">Todas las categorías</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select className={`${fieldClass} bg-white`} onChange={(event) => setBrand(event.target.value)} value={brand}><option value="">Todas las marcas</option>{brands.map((value) => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className="mt-7 grid gap-10">{groupedProducts.map(([group, groupProducts]) => <section key={group}><div className="mb-4 flex items-end justify-between gap-3 border-b border-[#cfdbea] pb-2"><h2 className="text-2xl font-extrabold tracking-[-0.025em]">{group}</h2><span className="text-sm font-bold text-[#64748b]">{groupProducts.length} {groupProducts.length === 1 ? "artículo" : "artículos"}</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{groupProducts.map((product) => <article className="overflow-hidden rounded-[16px] border border-[#dbe5f1] bg-white shadow-sm" key={product.id}><div className="relative aspect-[4/3] bg-[#edf3f9]">{product.imageUrl ? <Image alt={product.name} className="object-contain p-4" fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw" src={product.imageUrl} /> : <div className="grid h-full place-items-center text-5xl text-[#9aabc0]">▧</div>}</div><div className="p-4"><span className="text-xs font-bold uppercase text-[#64748b]">{product.brand || product.category || "Producto"}</span><h3 className="mt-2 min-h-12 font-extrabold leading-6">{product.name}</h3>{product.code && <p className="mt-1 text-xs text-[#718096]">Código {product.code}</p>}<div className="mt-4 flex items-center justify-between gap-2"><button aria-label={`Quitar ${product.name}`} className="h-10 w-10 rounded-full border border-[#cbd8e8] text-xl font-bold" onClick={() => changeQuantity(product.id, -1)} type="button">−</button><strong className="text-lg tabular-nums">{cart[product.id] ?? 0}</strong><button aria-label={`Agregar ${product.name}`} className="h-10 w-10 rounded-full bg-[#075ac7] text-xl font-bold text-white" onClick={() => changeQuantity(product.id, 1)} type="button">+</button></div></div></article>)}</div></section>)}</div>
      {!filtered.length && <p className="py-16 text-center font-semibold text-[#64748b]">No encontramos productos con ese filtro.</p>}
      <div className="sticky bottom-4 z-20 mt-8 flex items-center justify-between gap-4 rounded-[16px] bg-[#102d52] px-5 py-4 text-white shadow-2xl"><div><strong className="block text-lg">{totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}</strong><span className="text-sm text-white/70">{selected.length} {selected.length === 1 ? "producto" : "productos"} en el carrito</span></div><button className="rounded-[11px] bg-[#ffb74d] px-5 py-3 font-extrabold text-[#173052] disabled:opacity-50" disabled={!totalUnits} onClick={goToCheckout} type="button">Continuar</button></div>
    </> : <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]" onSubmit={submit}>
      <div className="rounded-[18px] border border-[#dbe5f1] bg-white p-5 shadow-sm sm:p-7"><button className="mb-5 text-sm font-bold text-[#075ac7]" onClick={() => setStep("catalog")} type="button">← Volver al catálogo</button><h2 className="text-2xl font-extrabold">Datos para la cotización</h2><p className="mt-2 text-[#64748b]">Los campos se pueden corregir manualmente antes de enviar.</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{[["name","Nombre y apellido *"],["phone","Teléfono *"],["brand","Marca o nombre comercial"],["taxId","CUIT"],["businessName","Razón social"],["industry","Rubro"]].map(([name,label]) => <label className="grid gap-1.5 text-sm font-bold" key={name}>{label}<input className={fieldClass} name={name} required={name === "name" || name === "phone"} /></label>)}</div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">Dirección de entrega</h3><p className="text-sm text-[#64748b]">Usá el mapa o completala manualmente.</p></div><button className="rounded-[10px] border border-[#075ac7] px-4 py-2 text-sm font-bold text-[#075ac7]" disabled={locating} onClick={locate} type="button">{locating ? "Ubicando…" : "Usar mi ubicación"}</button></div>
      <iframe className="mt-4 h-[260px] w-full rounded-[12px] border border-[#cbd8e8]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapUrl} title="Mapa de ubicación" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Dirección completa *<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, address: event.target.value }))} required value={location.address} /></label><label className="grid gap-1.5 text-sm font-bold">Localidad<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, city: event.target.value }))} value={location.city} /></label><label className="grid gap-1.5 text-sm font-bold">Provincia<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, province: event.target.value }))} value={location.province} /></label><label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Observación para el vendedor <span className="font-medium text-[#64748b]">(opcional)</span><textarea className="min-h-28 rounded-[9px] border border-[#cbd8e8] p-3 font-medium" maxLength={1000} name="notes" placeholder="Ej.: necesito asesoramiento, fecha estimada de entrega, presentación preferida…" /></label></div>{error && <p className="mt-4 rounded-[10px] bg-[#fff1f2] p-3 font-bold text-[#b4233d]" role="alert">{error}</p>}</div>
      <aside className="h-fit rounded-[18px] border border-[#dbe5f1] bg-white p-5 shadow-sm lg:sticky lg:top-24"><h2 className="text-xl font-extrabold">Tu carrito</h2><div className="mt-4 divide-y divide-[#e5ebf2]">{selected.map((product) => <div className="flex items-center justify-between gap-4 py-3" key={product.id}><span className="font-semibold">{product.name}</span><strong className="shrink-0">× {cart[product.id]}</strong></div>)}</div><p className="mt-4 rounded-[10px] bg-[#eef5ff] p-3 text-sm font-semibold text-[#315170]">Los precios serán definidos por el comercial al preparar el presupuesto.</p><button className="mt-5 w-full rounded-[11px] bg-[#075ac7] px-5 py-3.5 font-extrabold text-white disabled:opacity-50" disabled={submitting} type="submit">{submitting ? "Enviando…" : "Enviar pedido"}</button></aside>
    </form>}
  </section>;
}
