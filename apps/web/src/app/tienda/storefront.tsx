"use client";

import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CUSTOMER_BUSINESS_SEGMENTS } from "@/lib/customer-segments";
import type { SegmentRecommendation } from "@/lib/segment-recommendations";
import {
  STARLIM_CHALLENGE_MINIMUM,
  STARLIM_CHALLENGE_RADIUS_KM,
  STARLIM_CHALLENGE_SECONDS,
  STARLIM_CHALLENGE_STORAGE_KEY,
  starlimChallengeDistanceKm,
  type StarlimChallengeSession,
} from "@/lib/starlim-challenge";

type Availability = "available" | "check" | "out";
type Product = { id: string; name: string; code: string; category: string; brand: string; imageUrl: string | null; available: Availability; estimatedPrice: number };
type Combo = { id: string; name: string; businessSegment: string; items: { productId: string; productName: string; code: string; quantity: number }[] };
type Location = { address: string; city: string; province: string; latitude: string; longitude: string };
type Discovery = { industry: string; businessType: string; companyName: string; usualPurchases: string[]; currentSupplier: string; supplierCount: string };
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
const businessOptions = CUSTOMER_BUSINESS_SEGMENTS;
const purchaseOptions = ["Descartables", "Papelería", "Líquidos de limpieza", "Artículos", "Textil"];
const gastronomyNeeds = [
  { label: "Desengrasante", terms: ["desengras"] },
  { label: "Detergente", terms: ["detergente"] },
  { label: "Lavandina", terms: ["lavandina"] },
  { label: "Bolsas de residuos", terms: ["bolsa resid", "bolsa consorcio"] },
  { label: "Servilletas", terms: ["servilleta"] },
  { label: "Rollo de cocina", terms: ["rollo cocina", "toalla cocina"] },
  { label: "Guantes", terms: ["guante"] },
  { label: "Rejilla", terms: ["rejilla"] },
  { label: "Esponja", terms: ["esponja"] },
];

const customWork = [
  { title: "Dispensadores de jabón", description: "Equipamiento personalizado para reforzar la identidad de tu negocio.", image: "/custom-services/dispensador-jabon-personalizado.png" },
  { title: "Toalla en rollo", description: "Dispensadores resistentes para espacios de uso intensivo.", image: "/custom-services/dispensador-toalla-rollo-personalizado.png" },
  { title: "Papel higiénico", description: "Portarrollos institucionales preparados para grandes consumos.", image: "/custom-services/dispensador-papel-higienico-personalizado.png" },
];

const categoryPresentation: Record<string, { eyebrow: string; description: string; accent: string; icon: string }> = {
  descartables: { eyebrow: "Servicio ágil", description: "Vasos, bandejas, cubiertos y soluciones para cada entrega.", accent: "from-[#075ac7] to-[#0a79df]", icon: "◯" },
  papeleria: { eyebrow: "Reposición diaria", description: "Papeles, bobinas, servilletas y productos institucionales.", accent: "from-[#176b87] to-[#2b91a8]", icon: "▤" },
  limpieza: { eyebrow: "Cuidado profesional", description: "Líquidos y químicos para una limpieza eficiente y segura.", accent: "from-[#16784d] to-[#2c9a67]", icon: "✦" },
  articulos: { eyebrow: "Todo lo necesario", description: "Guantes, esponjas, cabos, baldes y accesorios de trabajo.", accent: "from-[#5d3ca0] to-[#7658bd]", icon: "◇" },
  textil: { eyebrow: "Rendimiento durable", description: "Trapos, rejillas, paños y textiles para uso intensivo.", accent: "from-[#b56213] to-[#e19532]", icon: "▦" },
  marca: { eyebrow: "Marcas seleccionadas", description: "Magnum, Usina, Esekaku y líneas destacadas del catálogo.", accent: "from-[#263f73] to-[#4260a1]", icon: "★" },
};

function normalizeCategory(value: string) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function AvailabilityBadge({ available }: { available: Availability }) {
  const status = available === "out"
    ? { label: "Sin stock momentáneo", className: "bg-[#fff1f2] text-[#b4233d]" }
    : available === "check"
      ? { label: "Consultar disponibilidad", className: "bg-[#fff7e8] text-[#9a5b00]" }
      : { label: "Disponible", className: "bg-[#e7f8ef] text-[#07834f]" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${status.className}`}>{status.label}</span>;
}

export function Storefront({ products, recommendations = [], combos = [], portalClientId = "" }: { products: Product[]; recommendations?: SegmentRecommendation[]; combos?: Combo[]; portalClientId?: string }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [section, setSection] = useState<SectionKey>("all");
  const [browseAll, setBrowseAll] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showRecommendedSelection, setShowRecommendedSelection] = useState(false);
  const [discoveryStep, setDiscoveryStep] = useState<1 | 2>(1);
  const [discovery, setDiscovery] = useState<Discovery>({ industry: "", businessType: "", companyName: "", usualPurchases: [], currentSupplier: "", supplierCount: "" });
  const [step, setStep] = useState<"catalog" | "checkout" | "success">("catalog");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<Location>({ address: "", city: "", province: "", latitude: "", longitude: "" });
  const [challengeStartedAt, setChallengeStartedAt] = useState(0);
  const [challengeSeconds, setChallengeSeconds] = useState(0);
  const [challengeDistance, setChallengeDistance] = useState<number | null>(null);
  const [challengeLocating, setChallengeLocating] = useState(false);
  const [challengeIdentityOpen, setChallengeIdentityOpen] = useState(false);
  const [challengeCustomer, setChallengeCustomer] = useState({ name: "", phone: "", businessName: "" });
  const catalogRef = useRef<HTMLDivElement>(null);
  const recommendationRef = useRef<HTMLDivElement>(null);
  const categoryCounts = useMemo(() => products.reduce((counts, product) => {
    if (product.category) counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()), [products]);
  const categories = useMemo(() => {
    const order = ["descartables", "papeleria", "limpieza", "articulos", "textil", "marca"];
    return [...categoryCounts.keys()].sort((a, b) => {
      const ai = order.indexOf(normalizeCategory(a));
      const bi = order.indexOf(normalizeCategory(b));
      if (ai !== bi) return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      return a.localeCompare(b, "es");
    });
  }, [categoryCounts]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const gastronomySelection = useMemo(() => {
    const used = new Set<string>();
    return gastronomyNeeds.flatMap((need) => {
      const match = products.find((product) => {
        if (used.has(product.id) || product.available === "out") return false;
        const name = normalizeCategory(product.name);
        return need.terms.some((term) => name.includes(term));
      });
      if (!match) return [];
      used.add(match.id);
      return [{ ...match, reason: need.label }];
    }).slice(0, 8);
  }, [products]);
  const recommendedSelection = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const measured = recommendations
      .filter((item) => item.segment === discovery.businessType)
      .flatMap((item) => {
        const product = byId.get(item.productId);
        return product && product.available !== "out" ? [{ ...product, reason: `${item.customerCoveragePercent}% de clientes`, typicalQuantity: item.typicalQuantity, provisional: item.provisional }] : [];
      });
    if (measured.length) return measured;
    if (discovery.businessType !== "Restaurante") return [];
    return gastronomySelection.map((product) => ({ ...product, typicalQuantity: 1, provisional: true }));
  }, [discovery.businessType, gastronomySelection, products, recommendations]);
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
  const estimatedCartAmount = selected.reduce((sum, product) => sum + product.estimatedPrice * (cart[product.id] ?? 0), 0);
  const challengeActive = challengeStartedAt > 0 && challengeSeconds > 0;
  const challengeMinimumReached = estimatedCartAmount >= STARLIM_CHALLENGE_MINIMUM;
  const visibleCombos = combos.filter((combo) => !combo.businessSegment || !discovery.businessType || combo.businessSegment === discovery.businessType);
  const showCatalog = browseAll || Boolean(category || brand || query.trim());
  const mapUrl = location.latitude && location.longitude
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(location.longitude) - .01}%2C${Number(location.latitude) - .01}%2C${Number(location.longitude) + .01}%2C${Number(location.latitude) + .01}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`
    : "https://www.openstreetmap.org/export/embed.html?bbox=-64.35%2C-31.55%2C-64.05%2C-31.25&layer=mapnik";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STARLIM_CHALLENGE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as StarlimChallengeSession;
      if (!saved.startedAt || saved.expiresAt <= Date.now() || starlimChallengeDistanceKm(saved.latitude, saved.longitude) > STARLIM_CHALLENGE_RADIUS_KM) {
        sessionStorage.removeItem(STARLIM_CHALLENGE_STORAGE_KEY);
        return;
      }
      setChallengeStartedAt(saved.startedAt);
      setChallengeSeconds(Math.max(0, Math.ceil((saved.expiresAt - Date.now()) / 1000)));
      setChallengeDistance(starlimChallengeDistanceKm(saved.latitude, saved.longitude));
      setChallengeCustomer({ name: saved.name, phone: saved.phone, businessName: saved.businessName });
      setLocation((current) => ({ ...current, latitude: String(saved.latitude), longitude: String(saved.longitude) }));
      setBrowseAll(true);
    } catch { sessionStorage.removeItem(STARLIM_CHALLENGE_STORAGE_KEY); }
  }, []);

  useEffect(() => {
    if (!challengeStartedAt) return;
    const update = () => setChallengeSeconds(Math.max(0, STARLIM_CHALLENGE_SECONDS - Math.floor((Date.now() - challengeStartedAt) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [challengeStartedAt]);

  function changeQuantity(id: string, delta: number) {
    setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(9999, (current[id] ?? 0) + delta)) }));
  }

  function goToCheckout() {
    setStep("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCategory(value: string) {
    setCategory(value);
    setSection("all");
    setQuery("");
    window.setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function togglePurchase(value: string) {
    setDiscovery((current) => ({ ...current, usualPurchases: current.usualPurchases.includes(value) ? current.usualPurchases.filter((item) => item !== value) : [...current.usualPurchases, value] }));
  }

  function finishDiscovery() {
    const categoryByPurchase: Record<string, string> = { "Descartables": "descartables", "Papelería": "papeleria", "Líquidos de limpieza": "limpieza", "Artículos": "articulos", "Textil": "textil" };
    const preferredCategories = discovery.usualPurchases.map((item) => categoryByPurchase[item]);
    const firstMatch = categories.find((value) => preferredCategories.includes(normalizeCategory(value)));
    setShowDiscovery(false);
    if (recommendedSelection.length) {
      setShowRecommendedSelection(true);
      window.setTimeout(() => recommendationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      return;
    }
    if (firstMatch) openCategory(firstMatch);
    else { setBrowseAll(true); window.setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
  }

  function addRecommendedSelection() {
    setCart((current) => Object.fromEntries([...Object.entries(current), ...recommendedSelection.map((product) => [product.id, Math.max(product.typicalQuantity, current[product.id] ?? 0)])]));
  }

  function addCombo(combo: Combo) {
    setCart((current) => {
      const next = { ...current };
      for (const item of combo.items) next[item.productId] = Math.max(next[item.productId] ?? 0, item.quantity);
      return next;
    });
  }

  function activateChallenge() {
    setError("");
    if (!navigator.geolocation) { setError("Necesitamos tu ubicación para validar el área del Desafío Starlim."); return; }
    setChallengeLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const distance = starlimChallengeDistanceKm(coords.latitude, coords.longitude);
      setChallengeDistance(distance);
      setLocation((current) => ({ ...current, latitude: String(coords.latitude), longitude: String(coords.longitude) }));
      if (distance > STARLIM_CHALLENGE_RADIUS_KM) {
        setError("Tu ubicación está fuera del área habilitada por el Desafío Starlim. Igual podés navegar y enviar un pedido normal.");
      } else {
        setChallengeIdentityOpen(true);
      }
      setChallengeLocating(false);
    }, () => { setError("No pudimos validar tu ubicación. Permití el acceso para activar el desafío."); setChallengeLocating(false); }, { enableHighAccuracy: true, timeout: 12000 });
  }


  function beginChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const form = new FormData(event.currentTarget);
    const customer = {
      name: String(form.get("challengeName") ?? "").trim(),
      phone: String(form.get("challengePhone") ?? "").trim(),
      businessName: String(form.get("challengeBusinessName") ?? "").trim(),
    };
    const startedAt = Date.now();
    const session: StarlimChallengeSession = { ...customer, startedAt, expiresAt: startedAt + STARLIM_CHALLENGE_SECONDS * 1000, latitude, longitude };
    sessionStorage.setItem(STARLIM_CHALLENGE_STORAGE_KEY, JSON.stringify(session));
    setChallengeCustomer(customer);
    setChallengeStartedAt(startedAt);
    setChallengeSeconds(STARLIM_CHALLENGE_SECONDS);
    setChallengeIdentityOpen(false);
    setBrowseAll(true);
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
      let accessToken = "";
      if (portalClientId) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) accessToken = (await createClient(url, key).auth.getSession()).data.session?.access_token ?? "";
      }
      const response = await fetch("/api/storefront/requests", { method: "POST", headers: { "Content-Type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify({ ...Object.fromEntries(form.entries()), ...discovery, usualPurchases: discovery.usualPurchases, ...location, portalClientId, challengeStartedAt: challengeStartedAt ? new Date(challengeStartedAt).toISOString() : "", items: selected.map((product) => ({ productId: product.id, quantity: cart[product.id] })) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos enviar el pedido");
      setStep("success"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos enviar el pedido"); }
    finally { setSubmitting(false); }
  }

  if (step === "success") return <section className="mx-auto grid min-h-[520px] max-w-3xl place-items-center px-5 py-16 text-center"><div className="rounded-[22px] border border-[#b8e3cf] bg-white p-8 shadow-xl sm:p-12"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f8ef] text-3xl text-[#07834f]">✓</span><h2 className="mt-6 text-3xl font-extrabold">Hemos recibido tu pedido</h2><p className="mt-4 text-lg leading-7 text-[#5b6b82]">A la brevedad un comercial se contactará con usted.</p><button className="mt-8 rounded-[11px] bg-[#075ac7] px-6 py-3 font-bold text-white" onClick={() => { setCart({}); setStep("catalog"); }} type="button">Volver a la tienda</button></div></section>;

  return <section className={`${challengeActive ? "challenge-fire-screen " : ""}mx-auto max-w-[1380px] px-4 py-8 sm:px-8`}>
    {step === "catalog" ? <>
      <section className="mb-8 overflow-hidden rounded-[24px] border border-[#ffb45c] bg-[linear-gradient(120deg,#5d160e,#b82b16_55%,#f47a22)] text-white shadow-[0_18px_55px_rgba(163,43,20,.24)]">
        <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
          <div><span className="text-xs font-black uppercase tracking-[.15em] text-[#ffd39c]">Entrega garantizada</span><h2 className="mt-2 text-3xl font-black tracking-[-.04em]">Desafío Starlim</h2><p className="mt-3 max-w-3xl font-medium leading-7 text-white/85">Validá tu ubicación, dejá tus datos y tenés 20 minutos para armar una solicitud desde $150.000. Cuando Starlim la confirma, comienzan las 24 horas hábiles: si no llegamos a tiempo, recibís 20% OFF.</p>
          {challengeStartedAt ? <div className="mt-5 flex flex-wrap items-center gap-3"><strong className="rounded-full bg-white px-4 py-2 text-xl tabular-nums text-[#861f13]">{String(Math.floor(challengeSeconds / 60)).padStart(2, "0")}:{String(challengeSeconds % 60).padStart(2, "0")}</strong><span className="font-bold">{challengeActive ? "Desafío activo" : "El tiempo terminó; podés activarlo nuevamente."}</span><span className={`rounded-full px-3 py-1.5 text-sm font-black ${challengeMinimumReached ? "bg-emerald-100 text-emerald-800" : "bg-white/15 text-white"}`}>{challengeMinimumReached ? "Mínimo alcanzado" : "Todavía no alcanzaste el mínimo"}</span>{challengeDistance !== null ? <span className="text-sm font-bold text-white/80">Ubicación validada a {challengeDistance.toFixed(1)} km del centro</span> : null}</div> : null}</div>
          <button className="challenge-flame-button min-h-14 rounded-full border-2 border-white/60 bg-[#ffb13b] px-7 text-lg font-black text-[#542009] transition hover:scale-105 disabled:opacity-60" disabled={challengeLocating || challengeActive} onClick={activateChallenge} type="button">{challengeLocating ? "Validando ubicación…" : challengeActive ? "Desafío activado" : "🔥 Activar desafío"}</button>
        </div>
        {challengeDistance !== null ? <div className="border-t border-white/20 bg-[#4b140f]/35 p-4 sm:px-8"><iframe className="h-52 w-full rounded-2xl border border-white/30" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapUrl} title="Ubicación para el Desafío Starlim" /><p className="mt-2 text-xs font-semibold text-white/75">Área promocional aproximada: radio operativo de 18 km alrededor del centro de Córdoba, incluyendo el corredor señalado alrededor de Circunvalación.</p></div> : null}
      {challengeIdentityOpen ? <div aria-modal="true" className="fixed inset-0 z-[60] grid place-items-center bg-[#2b0905]/75 p-4 backdrop-blur-sm" role="dialog"><form className="w-full max-w-lg rounded-[26px] border border-[#ffb15a] bg-white p-6 text-[#172033] shadow-2xl sm:p-8" onSubmit={beginChallenge}><button aria-label="Cerrar" className="float-right grid size-10 place-items-center rounded-full bg-[#fff1e8] font-black text-[#a32618]" onClick={() => setChallengeIdentityOpen(false)} type="button">×</button><span className="text-xs font-black uppercase tracking-[.13em] text-[#c13a1e]">Ubicación validada</span><h2 className="mt-2 text-3xl font-black">Antes de empezar</h2><p className="mt-2 text-[#64748b]">Dejanos tus datos y al continuar comienzan tus 20 minutos.</p><div className="mt-6 grid gap-3"><input className={fieldClass} name="challengeName" placeholder="Nombre y apellido" required /><input className={fieldClass} name="challengePhone" placeholder="WhatsApp o teléfono" required /><input className={fieldClass} name="challengeBusinessName" placeholder="Nombre del negocio (opcional)" /><button className="challenge-flame-button mt-2 min-h-14 rounded-full bg-[#ffb13b] px-5 font-black text-[#4c1908]" type="submit">Comenzar mi pedido →</button></div></form></div> : null}



      </section>

      {visibleCombos.length > 0 ? <section className="mb-8 rounded-[24px] border border-[#c6d9ef] bg-white p-6 shadow-[0_14px_38px_rgba(35,74,118,.11)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-[.13em] text-[#075ac7]">Compra más rápido</span><h2 className="mt-2 text-3xl font-black tracking-[-.035em]">Conocé nuestros combos</h2><p className="mt-2 text-[#64748b]">Selecciones pensadas por rubro. Agregalas completas y después cambiá cantidades, quitá o sumá productos.</p></div>{discovery.businessType ? <span className="rounded-full bg-[#eaf3ff] px-4 py-2 text-sm font-black text-[#075ac7]">Para {discovery.businessType}</span> : null}</div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleCombos.map((combo) => <article className="flex flex-col rounded-[18px] border border-[#dbe5f1] bg-[#f8fbff] p-5" key={combo.id}><span className="text-xs font-black uppercase text-[#59708a]">{combo.businessSegment || "Todos los rubros"}</span><h3 className="mt-2 text-xl font-black">{combo.name}</h3><ul className="mt-3 flex-1 space-y-1.5 text-sm text-[#52657b]">{combo.items.slice(0, 6).map((item) => <li key={item.productId}><strong>{item.quantity}×</strong> {item.productName}</li>)}</ul><button className="mt-5 rounded-xl bg-[#075ac7] px-4 py-3 font-black text-white" onClick={() => addCombo(combo)} type="button">Agregar combo al carrito</button></article>)}</div>
      </section> : null}

      <section className="mb-8 grid overflow-hidden rounded-[24px] bg-[#102d52] text-white shadow-[0_18px_50px_rgba(16,45,82,0.18)] lg:grid-cols-[1fr_auto]">
        <div className="p-6 sm:p-8"><span className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#9fc9ff]">Compra más simple</span><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Contanos qué tipo de negocio tenés</h2><p className="mt-3 max-w-2xl leading-7 text-white/75">En menos de un minuto te orientamos hacia los productos que más se usan en tu rubro. No hace falta registrarse ni dejar un teléfono.</p></div>
        <div className="flex items-center p-6 pt-0 sm:p-8 lg:pl-0"><button className="w-full rounded-[13px] bg-[#ffb74d] px-6 py-4 font-extrabold text-[#173052] transition hover:bg-[#ffc66f] lg:w-auto" onClick={() => { setDiscoveryStep(1); setShowDiscovery(true); }} type="button">Ayudame a elegir →</button></div>
      </section>
      <section aria-labelledby="custom-work-title" className="mb-8 overflow-hidden rounded-[24px] border border-[#d7e3ef] bg-white shadow-[0_16px_46px_rgba(26,55,96,0.12)]">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative min-h-[320px] overflow-hidden bg-[#e8edf1] sm:min-h-[420px]">
            <Image alt="Línea de dispensadores personalizados Starlim" className="object-cover" fill sizes="(max-width: 1023px) 100vw, 52vw" src="/custom-services/dispensadores-personalizados-starlim.png" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#081a30]/35 via-transparent to-transparent" />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-11">
            <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#075ac7]">También realizamos</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-[#172033] sm:text-4xl" id="custom-work-title">Soluciones personalizadas para tu espacio</h2>
            <p className="mt-4 max-w-xl font-medium leading-7 text-[#64748b]">Desarrollamos y personalizamos equipamiento institucional para que cada punto de contacto acompañe la imagen de tu negocio.</p>
            <a className="mt-7 inline-flex w-fit items-center rounded-[12px] bg-[#075ac7] px-5 py-3 font-extrabold text-white shadow-sm transition hover:bg-[#064da9] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#ffb74d]" href="https://wa.me/543543683594?text=Hola%2C%20quiero%20consultar%20por%20un%20trabajo%20personalizado" rel="noreferrer" target="_blank">Consultar un proyecto →</a>
          </div>
        </div>
        <div className="grid gap-4 border-t border-[#dfe8f2] bg-[#f7faff] p-5 sm:grid-cols-3 sm:p-7">
          {customWork.map((item) => (
            <article className="overflow-hidden rounded-[17px] border border-[#dbe5f1] bg-white shadow-sm" key={item.title}>
              <div className="relative aspect-square bg-[#eef2f5]"><Image alt={item.title} className="object-cover" fill sizes="(max-width: 639px) 100vw, 33vw" src={item.image} /></div>
              <div className="p-4"><h3 className="text-lg font-extrabold text-[#172033]">{item.title}</h3><p className="mt-2 text-sm font-medium leading-6 text-[#64748b]">{item.description}</p></div>
            </article>
          ))}
        </div>
      </section>
      {showDiscovery && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-end bg-[#07182d]/65 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="dialog">
        <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] bg-white p-6 shadow-2xl sm:max-w-2xl sm:rounded-[26px] sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#075ac7]">Paso {discoveryStep} de 2</span><h2 className="mt-2 text-2xl font-extrabold">{discoveryStep === 1 ? "¿Cómo es tu operación?" : "¿Cómo comprás actualmente?"}</h2></div><button aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef4fa] text-xl font-bold" onClick={() => setShowDiscovery(false)} type="button">×</button></div>
          {discoveryStep === 1 ? <div className="mt-6"><p className="mb-3 font-bold">¿Con qué rubro te identificás más?</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{businessOptions.map((value) => <button className={`min-h-14 rounded-[12px] border px-3 text-sm font-bold ${discovery.businessType === value ? "border-[#075ac7] bg-[#eaf3ff] text-[#075ac7] ring-2 ring-[#075ac7]/15" : "border-[#ccd9e8] text-[#40536b]"}`} key={value} onClick={() => setDiscovery((current) => ({ ...current, businessType: value, industry: value }))} type="button">{value}</button>)}</div><label className="mt-5 grid gap-1.5 text-sm font-bold">Nombre del negocio <span className="font-medium text-[#64748b]">(opcional)</span><input className={fieldClass} onChange={(event) => setDiscovery((current) => ({ ...current, companyName: event.target.value }))} placeholder="Ej.: Restaurante El Centro" value={discovery.companyName} /></label><button className="mt-7 w-full rounded-[12px] bg-[#075ac7] px-5 py-3.5 font-extrabold text-white disabled:opacity-40" disabled={!discovery.businessType} onClick={() => setDiscoveryStep(2)} type="button">Continuar</button></div>
          : <div className="mt-6"><p className="mb-3 font-bold">¿Qué productos comprás habitualmente?</p><div className="flex flex-wrap gap-2">{purchaseOptions.map((value) => <button className={`rounded-full border px-4 py-2.5 text-sm font-bold ${discovery.usualPurchases.includes(value) ? "border-[#075ac7] bg-[#075ac7] text-white" : "border-[#ccd9e8] text-[#40536b]"}`} key={value} onClick={() => togglePurchase(value)} type="button">{discovery.usualPurchases.includes(value) ? "✓ " : "+ "}{value}</button>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold">¿Con quién comprás hoy? <span className="font-medium text-[#64748b]">(opcional)</span><input className={fieldClass} onChange={(event) => setDiscovery((current) => ({ ...current, currentSupplier: event.target.value }))} placeholder="Proveedor o distribuidor" value={discovery.currentSupplier} /></label><label className="grid gap-1.5 text-sm font-bold">¿En cuántos proveedores dividís la compra?<select className={`${fieldClass} bg-white`} onChange={(event) => setDiscovery((current) => ({ ...current, supplierCount: event.target.value }))} value={discovery.supplierCount}><option value="">Seleccionar</option><option>1 proveedor</option><option>2 proveedores</option><option>3 proveedores</option><option>4 o más</option></select></label></div><button className="mt-7 w-full rounded-[12px] bg-[#075ac7] px-5 py-3.5 font-extrabold text-white disabled:opacity-40" disabled={!discovery.usualPurchases.length} onClick={finishDiscovery} type="button">Ver recomendaciones →</button></div>}
          <p className="mt-4 text-center text-xs font-medium text-[#7b8da3]">Todavía no te pedimos ningún dato de contacto.</p>
        </div>
      </div>}
      <div ref={recommendationRef} />
      {showRecommendedSelection && <section className="mb-8 overflow-hidden rounded-[24px] border border-[#bcd5ef] bg-white shadow-[0_16px_42px_rgba(35,74,118,0.13)]">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-[#eaf3ff] p-6 sm:p-7"><div><span className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#075ac7]">Selección para {discovery.businessType.toLocaleLowerCase("es")}</span><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Lo que más suelen necesitar negocios como el tuyo</h2><p className="mt-2 max-w-3xl text-[#536980]">Basado en compras registradas de clientes del mismo rubro. Es un punto de partida: podés cambiar cantidades, sacar productos o seguir recorriendo.</p></div><button aria-label="Cerrar selección" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-xl font-bold text-[#315170]" onClick={() => setShowRecommendedSelection(false)} type="button">×</button></div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">{recommendedSelection.map((product) => <article className="flex min-h-32 gap-3 rounded-[15px] border border-[#dbe5f1] p-3" key={product.id}><div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] bg-white">{product.imageUrl ? <Image alt="" className="object-contain p-2" fill sizes="80px" src={product.imageUrl} /> : <div className="grid h-full place-items-center rounded-[10px] bg-[#edf3f9] text-3xl text-[#9aabc0]">▧</div>}</div><div className="flex min-w-0 flex-1 flex-col"><span className="text-[11px] font-extrabold uppercase text-[#075ac7]">{product.reason}</span><strong className="mt-1 line-clamp-2 text-sm leading-5">{product.name}</strong><span className="mt-1 text-xs font-semibold text-[#64748b]">Cantidad sugerida: {product.typicalQuantity}</span><button className={`mt-auto self-start rounded-full px-3 py-1.5 text-xs font-extrabold ${cart[product.id] ? "bg-[#e7f8ef] text-[#07834f]" : "bg-[#075ac7] text-white"}`} onClick={() => setCart((current) => ({ ...current, [product.id]: Math.max(product.typicalQuantity, current[product.id] ?? 0) }))} type="button">{cart[product.id] ? `Agregado · ${cart[product.id]}` : "+ Agregar"}</button></div></article>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1eaf4] px-5 py-4 sm:px-7"><button className="font-bold text-[#075ac7]" onClick={() => { setShowRecommendedSelection(false); setBrowseAll(true); window.setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} type="button">Prefiero elegir uno por uno</button><button className="rounded-[12px] bg-[#ffb74d] px-5 py-3 font-extrabold text-[#173052]" onClick={addRecommendedSelection} type="button">Agregar selección al carrito</button></div>
      </section>}
      <section aria-labelledby="store-categories-title" className="mb-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><span className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#075ac7]">Comprá por categoría</span><h2 className="mt-1 text-3xl font-extrabold tracking-[-0.035em] sm:text-4xl" id="store-categories-title">¿Qué necesitás reponer?</h2><p className="mt-2 max-w-2xl text-[#64748b]">Entrá directamente al sector que buscás y armá el pedido en pocos pasos.</p></div>
          {showCatalog && <button className="text-sm font-extrabold text-[#075ac7] hover:underline" onClick={() => { setBrowseAll(false); setCategory(""); setBrand(""); setQuery(""); }} type="button">Volver a categorías</button>}
        </div>
        <label className="mb-5 block"><span className="sr-only">Buscar en toda la tienda</span><input className="min-h-14 w-full rounded-[16px] border border-[#b9cbe0] bg-white px-5 text-base font-semibold shadow-sm outline-none transition placeholder:font-medium placeholder:text-[#7b8da3] focus:border-[#075ac7] focus:ring-4 focus:ring-[#075ac7]/10" onChange={(event) => setQuery(event.target.value)} placeholder="¿Ya sabés qué buscás? Escribí producto, marca o código…" type="search" value={query} /></label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((value) => {
            const presentation = categoryPresentation[normalizeCategory(value)] ?? { eyebrow: "Explorá el catálogo", description: "Encontrá todos los productos disponibles en esta categoría.", accent: "from-[#315170] to-[#557493]", icon: "＋" };
            const active = category === value;
            return <button aria-pressed={active} className={`group relative min-h-52 overflow-hidden rounded-[22px] bg-gradient-to-br ${presentation.accent} p-6 text-left text-white shadow-[0_14px_34px_rgba(26,55,96,0.16)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(26,55,96,0.24)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#ffb74d] ${active ? "ring-4 ring-[#ffb74d]" : ""}`} key={value} onClick={() => openCategory(value)} type="button">
              <span aria-hidden="true" className="absolute -right-5 -top-8 text-[9rem] font-black text-white/10 transition group-hover:scale-110">{presentation.icon}</span>
              <span className="relative text-xs font-extrabold uppercase tracking-[0.13em] text-white/75">{presentation.eyebrow}</span>
              <strong className="relative mt-5 block text-3xl font-extrabold tracking-[-0.035em]">{value}</strong>
              <span className="relative mt-3 block max-w-[28rem] text-sm font-medium leading-6 text-white/80">{presentation.description}</span>
              <span className="relative mt-5 inline-flex items-center gap-2 font-extrabold">Ver {categoryCounts.get(value)} artículos <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span></span>
            </button>;
          })}
          <button className="group min-h-52 rounded-[22px] border-2 border-dashed border-[#a9bdd5] bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#075ac7] hover:shadow-lg focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#ffb74d]" onClick={() => { setBrowseAll(true); setCategory(""); window.setTimeout(() => catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} type="button">
            <span className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#075ac7]">Catálogo completo</span><strong className="mt-5 block text-3xl font-extrabold tracking-[-0.035em]">Ver todo</strong><span className="mt-3 block text-sm font-medium leading-6 text-[#64748b]">Recorré los {products.length} artículos y combiná filtros por marca o categoría.</span><span className="mt-5 inline-flex items-center gap-2 font-extrabold text-[#075ac7]">Abrir catálogo <span aria-hidden="true" className="transition group-hover:translate-x-1">→</span></span>
          </button>
        </div>
      </section>
      <div ref={catalogRef} />
      {showCatalog && <>
      <div className="rounded-[16px] border border-[#dbe5f1] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf2] pb-4"><div><strong className="block text-lg">+{products.length} artículos en lista</strong><span className="text-sm font-medium text-[#64748b]">{filtered.length} visibles con los filtros actuales</span></div><button className="rounded-[11px] bg-[#ffb74d] px-5 py-3 font-extrabold text-[#173052] shadow-sm disabled:opacity-50" disabled={!totalUnits} onClick={goToCheckout} type="button">Continuar · {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}</button></div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Secciones de productos">{sectionFilters.map((item) => <button aria-pressed={section === item.key} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${section === item.key ? "bg-[#075ac7] text-white" : "border border-[#cbd8e8] text-[#315170] hover:bg-[#f4f8fc]"}`} key={item.key} onClick={() => { setSection(item.key); setCategory(""); setBrowseAll(true); }} type="button">{item.label}</button>)}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_230px_230px]"><input className={fieldClass} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, código, marca o categoría" type="search" value={query} /><select className={`${fieldClass} bg-white`} onChange={(event) => { setCategory(event.target.value); if (!event.target.value) setBrowseAll(true); }} value={category}><option value="">Todas las categorías</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select className={`${fieldClass} bg-white`} onChange={(event) => setBrand(event.target.value)} value={brand}><option value="">Todas las marcas</option>{brands.map((value) => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className="mt-7 grid gap-10">{groupedProducts.map(([group, groupProducts]) => <section key={group}><div className="mb-4 flex items-end justify-between gap-3 border-b border-[#cfdbea] pb-2"><h2 className="text-2xl font-extrabold tracking-[-0.025em]">{group}</h2><span className="text-sm font-bold text-[#64748b]">{groupProducts.length} {groupProducts.length === 1 ? "artículo" : "artículos"}</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{groupProducts.map((product) => <article className="overflow-hidden rounded-[16px] border border-[#dbe5f1] bg-white shadow-sm" key={product.id}><div className="relative aspect-[4/3] bg-white">{product.imageUrl ? <Image alt={product.name} className="object-contain p-4" fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw" src={product.imageUrl} /> : <div className="grid h-full place-items-center bg-[#edf3f9] text-5xl text-[#9aabc0]">▧</div>}</div><div className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-[#64748b]">{product.brand || product.category || "Producto"}</span><AvailabilityBadge available={product.available} /></div><h3 className="mt-2 min-h-12 font-extrabold leading-6">{product.name}</h3>{product.code && <p className="mt-1 text-xs text-[#718096]">Código {product.code}</p>}<div className="mt-4 flex items-center justify-between gap-2"><button aria-label={`Quitar ${product.name}`} className="h-10 w-10 rounded-full border border-[#cbd8e8] text-xl font-bold" onClick={() => changeQuantity(product.id, -1)} type="button">−</button><strong className="text-lg tabular-nums">{cart[product.id] ?? 0}</strong><button aria-label={`Agregar ${product.name}`} className="h-10 w-10 rounded-full bg-[#075ac7] text-xl font-bold text-white" onClick={() => changeQuantity(product.id, 1)} type="button">+</button></div></div></article>)}</div></section>)}</div>
      {!filtered.length && <p className="py-16 text-center font-semibold text-[#64748b]">No encontramos productos con ese filtro.</p>}
      <div className="sticky bottom-4 z-20 mt-8 flex items-center justify-between gap-4 rounded-[16px] bg-[#102d52] px-5 py-4 text-white shadow-2xl"><div><strong className="block text-lg">{totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}</strong><span className="text-sm text-white/70">{selected.length} {selected.length === 1 ? "producto" : "productos"} en el carrito</span></div><button className="rounded-[11px] bg-[#ffb74d] px-5 py-3 font-extrabold text-[#173052] disabled:opacity-50" disabled={!totalUnits} onClick={goToCheckout} type="button">Continuar</button></div>
      </>}
    </> : <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]" onSubmit={submit}>
      <div className="rounded-[18px] border border-[#dbe5f1] bg-white p-5 shadow-sm sm:p-7"><button className="mb-5 text-sm font-bold text-[#075ac7]" onClick={() => setStep("catalog")} type="button">← Volver al catálogo</button><span className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#075ac7]">Último paso</span><h2 className="mt-2 text-2xl font-extrabold">¿A dónde te enviamos la propuesta?</h2><p className="mt-2 text-[#64748b]">Ya elegiste lo que te interesa. Ahora un comercial prepara la cotización y te contacta.</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{[["name","Nombre y apellido *"],["phone","WhatsApp o teléfono *"],["brand","Marca o nombre comercial"],["taxId","CUIT"],["businessName","Razón social"]].map(([name,label]) => <label className="grid gap-1.5 text-sm font-bold" key={name}>{label}<input className={fieldClass} defaultValue={name === "name" ? challengeCustomer.name : name === "phone" ? challengeCustomer.phone : name === "businessName" ? challengeCustomer.businessName : ""} name={name} required={name === "name" || name === "phone"} /></label>)}<label className="grid gap-1.5 text-sm font-bold">Rubro<input className={fieldClass} name="industry" onChange={(event) => setDiscovery((current) => ({ ...current, industry: event.target.value }))} value={discovery.industry} /></label></div>
      {(discovery.businessType || discovery.usualPurchases.length > 0) && <div className="mt-5 rounded-[12px] bg-[#eef5ff] p-4 text-sm text-[#315170]"><strong className="block">Perfil de compra guardado</strong><span>{[discovery.businessType, discovery.usualPurchases.join(", ")].filter(Boolean).join(" · ")}</span></div>}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold">Dirección de entrega</h3><p className="text-sm text-[#64748b]">Usá el mapa o completala manualmente.</p></div><button className="rounded-[10px] border border-[#075ac7] px-4 py-2 text-sm font-bold text-[#075ac7]" disabled={locating} onClick={locate} type="button">{locating ? "Ubicando…" : "Usar mi ubicación"}</button></div>
      <iframe className="mt-4 h-[260px] w-full rounded-[12px] border border-[#cbd8e8]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapUrl} title="Mapa de ubicación" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Dirección completa *<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, address: event.target.value }))} required value={location.address} /></label><label className="grid gap-1.5 text-sm font-bold">Localidad<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, city: event.target.value }))} value={location.city} /></label><label className="grid gap-1.5 text-sm font-bold">Provincia<input className={fieldClass} onChange={(event) => setLocation((value) => ({ ...value, province: event.target.value }))} value={location.province} /></label><label className="grid gap-1.5 text-sm font-bold sm:col-span-2">Observación para el vendedor <span className="font-medium text-[#64748b]">(opcional)</span><textarea className="min-h-28 rounded-[9px] border border-[#cbd8e8] p-3 font-medium" maxLength={1000} name="notes" placeholder="Ej.: necesito asesoramiento, fecha estimada de entrega, presentación preferida…" /></label></div>{error && <p className="mt-4 rounded-[10px] bg-[#fff1f2] p-3 font-bold text-[#b4233d]" role="alert">{error}</p>}</div>
      <aside className="h-fit rounded-[18px] border border-[#dbe5f1] bg-white p-5 shadow-sm lg:sticky lg:top-24"><h2 className="text-xl font-extrabold">Tu carrito</h2><div className="mt-4 divide-y divide-[#e5ebf2]">{selected.map((product) => <div className="flex items-center justify-between gap-4 py-3" key={product.id}><span className="font-semibold">{product.name}</span><strong className="shrink-0">× {cart[product.id]}</strong></div>)}</div><p className="mt-4 rounded-[10px] bg-[#eef5ff] p-3 text-sm font-semibold text-[#315170]">Los precios serán definidos por el comercial al preparar el presupuesto.</p>{challengeStartedAt ? <p className={`mt-3 rounded-[10px] p-3 text-sm font-bold ${challengeActive && challengeMinimumReached ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{!challengeActive ? "El temporizador del desafío venció." : challengeMinimumReached ? "Tu solicitud cumple el mínimo del Desafío Starlim." : "Sumá productos hasta alcanzar el mínimo interno de $150.000."}</p> : null}<button className="mt-5 w-full rounded-[11px] bg-[#075ac7] px-5 py-3.5 font-extrabold text-white disabled:opacity-50" disabled={submitting || Boolean(challengeStartedAt && (!challengeActive || !challengeMinimumReached))} type="submit">{submitting ? "Enviando…" : "Enviar pedido"}</button></aside>
    </form>}
  </section>;
}
