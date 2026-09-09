"use client";

import { createClient, type Session } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money as roundMoney, priceForList } from "@/lib/order-pricing";

type Product = {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  presentationUnits: number;
  available: number;
  usualQuantity: number;
  purchaseCount: number;
  prices: Record<string, number>;
};
type Offer = {
  id: string;
  name: string;
  priceMode: string;
  fixedPrice: number | null;
  discountPercent: number | null;
  items: { productId: string; productName: string; quantity: number }[];
};
type Data = {
  customer: {
    id: string;
    name: string;
    selectedList: string;
    payment_term_days: number | null;
  };
  lists: string[];
  products: Product[];
  recommendations: string[];
  repeatItems: { productId: string; quantity: number }[];
  offers: Offer[];
};
type Cart = Record<string, number>;
type CheckoutState = {
  intentId: string;
  amount: number;
  checkoutUrl: string;
  qrDataUrl: string;
  status: "created" | "pending" | "approved" | "rejected" | "cancelled";
  orderNumber?: string | null;
};
const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});
const MINIMUM_ORDER = 50_000;
const VOLUME_THRESHOLD = 100_000;

function portalLinePricing(
  product: Product,
  quantity: number,
  priceListName: string,
  rapidPayment: boolean,
) {
  const presentation = Math.max(1, product.presentationUnits);
  const volumeQuantity =
    presentation > 1 ? Math.floor(quantity / presentation) * presentation : 0;
  const regularQuantity = quantity - volumeQuantity;
  const regularUnitPrice = priceForList(product.prices, priceListName);
  const volumeUnitPrice =
    priceForList(product.prices, "L1 - suave") * (rapidPayment ? 0.95 : 1);
  const subtotal = roundMoney(
    volumeQuantity * volumeUnitPrice + regularQuantity * regularUnitPrice,
  );
  return {
    subtotal,
    effectiveUnitPrice:
      quantity > 0 ? roundMoney(subtotal / quantity) : regularUnitPrice,
    unitsToNextPresentation:
      presentation > 1 && regularQuantity > 0
        ? presentation - regularQuantity
        : null,
  };
}

function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: true } })
    : null;
}

export function PortalOrderBuilder({
  clientId,
  repeatSaleId,
}: {
  clientId: string;
  repeatSaleId: string;
}) {
  const supabase = useMemo(() => browserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<
    "cuenta_corriente" | "efectivo" | "qr"
  >("cuenta_corriente");
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [invoiceChoice, setInvoiceChoice] = useState<
    "sin_factura" | "con_factura"
  >("sin_factura");
  const [photo, setPhoto] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState("");
  useEffect(() => {
    supabase?.auth
      .getSession()
      .then(({ data: auth }) => setSession(auth.session));
  }, [supabase]);
  useEffect(() => {
    if (!session || !clientId) return;
    const qs = new URLSearchParams({ clientId });
    if (repeatSaleId) qs.set("repeatSaleId", repeatSaleId);
    fetch(`/api/portal/order-builder?${qs}`, {
      headers: { authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        return p.data as Data;
      })
      .then((value) => {
        setData(value);
        setCart(
          Object.fromEntries(
            value.repeatItems.map((item) => [item.productId, item.quantity]),
          ),
        );
      })
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "No pudimos preparar el pedido",
        ),
      )
      .finally(() => setLoading(false));
  }, [session, clientId, repeatSaleId]);
  const productsById = useMemo(
    () => new Map((data?.products ?? []).map((p) => [p.id, p])),
    [data],
  );
  const rows = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ product: productsById.get(id)!, qty }))
        .filter((r) => r.product),
    [cart, productsById],
  );
  const baseTotal = rows.reduce(
    (sum, row) => sum + priceForList(row.product.prices, "L3 - caro") * row.qty,
    0,
  );
  const rapidPayment = payment === "efectivo" || payment === "qr";
  const activePriceList = rapidPayment
    ? "L1 - suave"
    : baseTotal >= VOLUME_THRESHOLD
      ? "L2 - ANCLA"
      : "L3 - caro";
  const price = (p: Product) => priceForList(p.prices, activePriceList);
  const pricing = (p: Product, qty: number) =>
    portalLinePricing(p, qty, activePriceList, rapidPayment);
  const netSubtotal = roundMoney(
    rows.reduce((sum, row) => sum + pricing(row.product, row.qty).subtotal, 0),
  );
  const vatRate = invoiceChoice === "con_factura" ? 21 : 10.5;
  const vatAmount = roundMoney((netSubtotal * vatRate) / 100);
  const total = roundMoney(netSubtotal + vatAmount);
  const regularTotal = rows.reduce(
    (sum, row) =>
      sum +
      portalLinePricing(
        row.product,
        row.qty,
        baseTotal >= VOLUME_THRESHOLD ? "L2 - ANCLA" : "L3 - caro",
        false,
      ).subtotal,
    0,
  );
  const rapidSaving = Math.max(
    0,
    roundMoney(
      regularTotal -
        rows.reduce(
          (sum, row) =>
            sum +
            portalLinePricing(row.product, row.qty, "L1 - suave", true)
              .subtotal,
          0,
        ),
    ),
  );
  const totalSavings = Math.max(
    0,
    roundMoney(baseTotal * (1 + vatRate / 100) - total),
  );
  const amountToMinimum = Math.max(0, roundMoney(MINIMUM_ORDER - netSubtotal));
  const amountToVolume = Math.max(0, roundMoney(VOLUME_THRESHOLD - baseTotal));
  const recommended = (data?.recommendations ?? [])
    .map((id) => productsById.get(id))
    .filter((p): p is Product => Boolean(p));
  const results = query.trim()
    ? (data?.products
        .filter((p) =>
          `${p.name} ${p.code}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 20) ?? [])
    : recommended;
  const benefits = (data?.offers ?? []).flatMap((offer) => {
    const missing = offer.items
      .map((item) => ({
        ...item,
        missing: Math.max(0, item.quantity - (cart[item.productId] ?? 0)),
      }))
      .filter((item) => item.missing > 0);
    const hasSome = offer.items.some((item) => (cart[item.productId] ?? 0) > 0);
    return hasSome && missing.length ? [{ offer, missing }] : [];
  });
  const presentationBenefits = rows.flatMap(({ product, qty }) => {
    const detail = pricing(product, qty);
    return detail.unitsToNextPresentation
      ? [{ product, missing: detail.unitsToNextPresentation }]
      : [];
  });
  const setQty = (id: string, qty: number) =>
    setCart((current) => ({
      ...current,
      [id]: Math.max(0, Math.floor(qty || 0)),
    }));
  async function submit() {
    if (!session || !data || !rows.length) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/portal/order-builder", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          clientId: data.customer.id,
          paymentMethod: payment,
          invoiceChoice,
          items: rows.map((r) => ({
            productId: r.product.id,
            quantity: r.qty,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (payload.data.checkout) {
        setCheckout({ ...payload.data.checkout, status: "created" });
        window.setTimeout(
          () =>
            document
              .getElementById("pago-pedido")
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          50,
        );
      } else {
        setCreated(payload.data.quoteNumber);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar el pedido");
    } finally {
      setSending(false);
    }
  }
  useEffect(() => {
    if (
      !checkout ||
      !session ||
      ["approved", "rejected", "cancelled"].includes(checkout.status)
    )
      return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          "/api/portal/checkout/" +
            encodeURIComponent(checkout.intentId) +
            "/status",
          {
            headers: { authorization: "Bearer " + session.access_token },
            cache: "no-store",
          },
        );
        const payload = await response.json();
        if (!response.ok) return;
        setCheckout((current) =>
          current
            ? {
                ...current,
                status: payload.data.status,
                orderNumber: payload.data.orderNumber,
              }
            : current,
        );
      } catch {
        // La próxima consulta vuelve a intentar sin interrumpir al cliente.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [checkout, session]);
  if (!clientId)
    return <Centered text="Volvé al portal y elegí una sucursal." />;
  if (loading) return <Centered text="Preparando tu pedido…" />;
  if (error && !data) return <Centered text={error} />;
  if (!data) return null;
  if (created)
    return (
      <Centered
        text={`Pedido ${created} recibido. Starlim lo revisará y podrás seguirlo desde tu portal.`}
        action="Volver a mi portal"
      />
    );
  return (
    <main className="min-h-screen bg-[#f3f7fc] text-[#172033]">
      <header className="sticky top-0 z-30 border-b border-white/20 bg-[#075ac7] px-5 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/portal">
            <Image
              alt="Starlim"
              className="h-auto w-28"
              height={52}
              src="/starlim-logo-white.png"
              width={140}
            />
          </Link>
          <div className="text-right">
            <strong className="block">{data.customer.name}</strong>
            <Link
              className="text-sm text-white/80 hover:text-white"
              href="/portal"
            >
              ← Volver al portal
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid content-start gap-5">
          <div>
            <span className="text-xs font-black uppercase tracking-[.13em] text-[#075ac7]">
              Pedido para cliente
            </span>
            <h1 className="mt-1 text-3xl font-black">
              {repeatSaleId
                ? "Revisá y ajustá tu último pedido"
                : "Armá tu pedido en pocos pasos"}
            </h1>
            <p className="mt-2 text-[#64748b]">
              Buscá sólo lo que necesitás. Tus productos habituales aparecen
              primero.
            </p>
          </div>
          <div className="rounded-2xl border border-[#dbe5f1] bg-white p-4 shadow-sm">
            <label className="text-sm font-extrabold" htmlFor="product-search">
              Buscar producto
            </label>
            <input
              autoFocus
              className="mt-2 min-h-12 w-full rounded-xl border border-[#bcd0e7] px-4 text-base outline-none focus:border-[#075ac7] focus:ring-2 focus:ring-blue-100"
              id="product-search"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej.: detergente, rejilla o código"
              value={query}
            />
          </div>
          <div>
            <h2 className="text-lg font-black">
              {query
                ? "Resultados de búsqueda"
                : "Recomendados según tus compras habituales"}
            </h2>
            {!query ? (
              <p className="mt-1 text-sm text-[#64748b]">
                Productos elegidos a partir de tu historial de compras.
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            {results.map((product) => (
              <article
                className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[#dbe5f1] bg-white p-3 shadow-sm"
                key={product.id}
              >
                <button
                  aria-label={`Ver foto de ${product.name}`}
                  className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl bg-[#eef4fb]"
                  onClick={() => setPhoto(product)}
                  type="button"
                >
                  {product.imageUrl ? (
                    <Image
                      alt={product.name}
                      className="h-full w-full object-contain"
                      height={64}
                      src={product.imageUrl}
                      unoptimized
                      width={64}
                    />
                  ) : (
                    <span className="text-xl">🧴</span>
                  )}
                </button>
                <div className="min-w-0">
                  <strong className="block truncate">{product.name}</strong>
                  <span className="text-xs text-[#64748b]">
                    {product.code || "Sin código"}
                  </span>
                  <span className="mt-1 block font-black text-[#075ac7]">
                    {money.format(price(product))}
                  </span>
                </div>
                <button
                  className="min-h-10 rounded-xl bg-[#075ac7] px-4 text-sm font-extrabold text-white"
                  onClick={() =>
                    setQty(
                      product.id,
                      (cart[product.id] ?? 0) || product.usualQuantity || 1,
                    )
                  }
                  type="button"
                >
                  {cart[product.id] ? "Agregado" : "Agregar"}
                </button>
              </article>
            ))}
          </div>
        </section>
        <aside className="grid content-start gap-4 lg:self-start">
          <section className="rounded-3xl border border-[#cbdbea] bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Tu pedido</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#075ac7]">
                {rows.length} productos
              </span>
            </div>
            {amountToMinimum > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <strong className="text-sm text-amber-900">
                  Pedido mínimo: faltan {money.format(amountToMinimum)}
                </strong>
                <p className="mt-1 text-xs text-amber-800">
                  El mínimo es de {money.format(MINIMUM_ORDER)} netos en
                  mercadería.
                </p>
              </div>
            ) : null}
            {rows.length ? (
              <div className="mt-4 grid gap-3">
                {rows.map(({ product, qty }) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_92px_28px] items-center gap-2 border-b border-[#e7eef6] pb-3"
                    key={product.id}
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-sm">
                        {product.name}
                      </strong>
                      <span className="text-xs text-[#64748b]">
                        {money.format(pricing(product, qty).subtotal)}
                      </span>
                    </div>
                    <input
                      aria-label={`Cantidad de ${product.name}`}
                      className="h-10 rounded-lg border border-[#bfd0e4] px-2 text-center font-bold"
                      min="1"
                      onChange={(e) =>
                        setQty(product.id, Number(e.target.value))
                      }
                      type="number"
                      value={qty}
                    />
                    <button
                      aria-label={`Quitar ${product.name}`}
                      className="text-xl text-red-500"
                      onClick={() => setQty(product.id, 0)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-[#f4f7fb] p-4 text-sm text-[#64748b]">
                Todavía no agregaste productos.
              </p>
            )}
            <fieldset className="mt-4">
              <legend className="text-xs font-extrabold">Comprobante</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Choice
                  active={invoiceChoice === "sin_factura"}
                  label="Sin factura · IVA 10,5%"
                  onClick={() => setInvoiceChoice("sin_factura")}
                />
                <Choice
                  active={invoiceChoice === "con_factura"}
                  label="Con factura · IVA 21%"
                  onClick={() => setInvoiceChoice("con_factura")}
                />
              </div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-xs font-extrabold">Forma de pago</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Choice
                  active={payment === "cuenta_corriente"}
                  label="Cta. corriente"
                  onClick={() => {
                    setPayment("cuenta_corriente");
                    setCheckout(null);
                  }}
                />
                <Choice
                  active={payment === "efectivo"}
                  label="Efectivo"
                  onClick={() => {
                    setPayment("efectivo");
                    setCheckout(null);
                  }}
                />
                <Choice
                  active={payment === "qr"}
                  label="QR"
                  onClick={() => setPayment("qr")}
                />
              </div>
            </fieldset>
            <div className="mt-3 rounded-xl bg-[#f4f7fb] p-3 text-sm">
              <strong>
                {rapidPayment
                  ? "Beneficio por pago rápido"
                  : baseTotal >= VOLUME_THRESHOLD
                    ? "Beneficio por volumen"
                    : "Precio inicial"}
              </strong>
              <span className="mt-1 block text-xs text-[#64748b]">
                {rapidPayment
                  ? "El precio se confirma con la acreditación del pago."
                  : baseTotal >= VOLUME_THRESHOLD
                    ? "Aplicado automáticamente por superar los $100.000."
                    : "Mejora automáticamente al alcanzar $100.000."}
              </span>
            </div>

            {rows.length ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                  Ahorro acumulado
                </span>
                <strong className="mt-1 block text-2xl font-black text-emerald-700">
                  {money.format(totalSavings)}
                </strong>
                <span className="text-xs text-emerald-800">
                  Precio sin beneficios:{" "}
                  {money.format(roundMoney(baseTotal * (1 + vatRate / 100)))}
                </span>
              </div>
            ) : null}
            <div className="mt-5 grid gap-1 border-t border-[#dbe5f1] pt-4 text-sm">
              <div className="flex justify-between">
                <span>Mercadería neta</span>
                <strong>{money.format(netSubtotal)}</strong>
              </div>
              <div className="flex justify-between">
                <span>IVA {String(vatRate).replace(".", ",")}%</span>
                <strong>{money.format(vatAmount)}</strong>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-bold">Total estimado</span>
                <strong className="text-2xl">{money.format(total)}</strong>
              </div>
            </div>
            <p className="mt-1 text-xs text-[#64748b]">
              El equipo comercial confirmará disponibilidad y condición final.
            </p>
            {error ? (
              <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
            ) : null}
            <button
              className="mt-4 min-h-12 w-full rounded-xl bg-[#075ac7] font-black text-white disabled:opacity-50"
              disabled={!rows.length || sending || amountToMinimum > 0}
              onClick={submit}
              type="button"
            >
              {sending
                ? "Procesando…"
                : payment === "qr"
                  ? "Generar QR y pagar"
                  : "Enviar pedido"}
            </button>
            {checkout ? (
              <div
                className="mt-4 scroll-mt-24 rounded-2xl border border-[#9fc8ef] bg-[#f5fbff] p-4"
                id="pago-pedido"
                aria-live="polite"
              >
                {checkout.status === "approved" ? (
                  <div className="text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-600 text-2xl font-black text-white">
                      ✓
                    </span>
                    <h3 className="mt-3 text-xl font-black text-emerald-800">
                      Pago confirmado
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      Tu pedido {checkout.orderNumber || ""} ya ingresó al ERP y
                      está pendiente de entrega.
                    </p>
                    <Link
                      className="mt-4 inline-flex rounded-xl bg-[#075ac7] px-4 py-3 font-black text-white"
                      href="/portal"
                    >
                      Ver mi pedido
                    </Link>
                  </div>
                ) : (
                  <div>
                    <Image
                      alt="QR de Mercado Pago para abonar el pedido"
                      className="mx-auto size-52 rounded-xl border border-[#dbe5f1] bg-white"
                      height={208}
                      src={checkout.qrDataUrl}
                      unoptimized
                      width={208}
                    />
                    <h3 className="mt-3 text-center text-lg font-black">
                      Pagá {money.format(checkout.amount)}
                    </h3>
                    <div className="mt-4 grid gap-2 text-sm font-bold">
                      <PaymentStep active label="QR generado" />
                      <PaymentStep
                        active={checkout.status === "pending"}
                        label="Esperando acreditación"
                      />
                      <PaymentStep
                        active={false}
                        label="Enviando pedido al ERP"
                      />
                    </div>
                    <p className="mt-3 text-center text-xs text-[#64748b]">
                      La pantalla se actualiza sola. El pedido se crea
                      únicamente cuando Mercado Pago confirma el pago.
                    </p>
                    <a
                      className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-[#009ee3] font-extrabold text-white"
                      href={checkout.checkoutUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir Mercado Pago
                    </a>
                  </div>
                )}
              </div>
            ) : null}
          </section>
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-black">Beneficios no aprovechados</h2>
              <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-black">
                {benefits.length +
                  presentationBenefits.length +
                  (amountToVolume > 0 ? 1 : 0) +
                  (!rapidPayment && rapidSaving > 0 ? 1 : 0)}
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {amountToVolume > 0 ? (
                <div className="rounded-xl bg-white p-3">
                  <strong className="text-sm">
                    Mejorá el precio de todo el pedido
                  </strong>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Sumá {money.format(amountToVolume)} para alcanzar el
                    beneficio por volumen.
                  </p>
                </div>
              ) : null}
              {!rapidPayment && rapidSaving > 0 ? (
                <button
                  className="rounded-xl bg-white p-3 text-left"
                  onClick={() => setPayment("efectivo")}
                  type="button"
                >
                  <strong className="text-sm">
                    Ahorrá {money.format(rapidSaving)} pagando ahora
                  </strong>
                  <span className="mt-1 block text-xs text-[#64748b]">
                    Elegí efectivo o QR de Mercado Pago para acceder al precio
                    de pago rápido.
                  </span>
                </button>
              ) : null}
              {presentationBenefits.map(({ product, missing }) => (
                <div
                  className="rounded-xl bg-white p-3"
                  key={`presentation-${product.id}`}
                >
                  <strong className="text-sm">
                    Precio mejorado por presentación
                  </strong>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Agregá {missing} {missing === 1 ? "unidad" : "unidades"} de{" "}
                    {product.name} para completar {product.presentationUnits} y
                    acceder al precio mejorado.
                  </p>
                  <button
                    className="mt-2 text-xs font-black text-[#075ac7]"
                    onClick={() =>
                      setQty(product.id, (cart[product.id] ?? 0) + missing)
                    }
                    type="button"
                  >
                    Completar presentación →
                  </button>
                </div>
              ))}
              {benefits.map(({ offer, missing }) => (
                <div className="rounded-xl bg-white p-3" key={offer.id}>
                  <strong className="text-sm">{offer.name}</strong>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Agregá{" "}
                    {missing
                      .map((item) => `${item.missing} ${item.productName}`)
                      .join(" + ")}{" "}
                    para completar la promoción.
                  </p>
                  <button
                    className="mt-2 text-xs font-black text-[#075ac7]"
                    onClick={() =>
                      missing.forEach((item) =>
                        setQty(
                          item.productId,
                          (cart[item.productId] ?? 0) + item.missing,
                        ),
                      )
                    }
                    type="button"
                  >
                    Aprovechar beneficio →
                  </button>
                </div>
              ))}
              {benefits.length === 0 &&
              presentationBenefits.length === 0 &&
              amountToVolume === 0 &&
              rapidPayment ? (
                <p className="text-sm text-amber-900">
                  No hay otros beneficios pendientes para esta selección.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
      {photo ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5"
          onClick={() => setPhoto(null)}
          role="presentation"
        >
          <div
            className="max-w-lg rounded-3xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-5">
              <strong>{photo.name}</strong>
              <button onClick={() => setPhoto(null)} type="button">
                ✕
              </button>
            </div>
            {photo.imageUrl ? (
              <Image
                alt={photo.name}
                className="mt-4 max-h-[65vh] w-full object-contain"
                height={600}
                src={photo.imageUrl}
                unoptimized
                width={600}
              />
            ) : (
              <p className="mt-5 text-[#64748b]">
                Este producto todavía no tiene una foto cargada.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
function PaymentStep({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={
        "flex items-center gap-2 rounded-lg px-3 py-2 " +
        (active ? "bg-emerald-50 text-emerald-700" : "bg-white text-[#64748b]")
      }
    >
      <span
        className={
          "size-2.5 rounded-full " +
          (active ? "bg-emerald-500" : "bg-[#cbd5e1]")
        }
      />
      {label}
    </div>
  );
}
function Choice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-11 rounded-xl border px-2 text-sm font-bold ${active ? "border-[#075ac7] bg-blue-50 text-[#075ac7]" : "border-[#ccd9e8] bg-white"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
function Centered({ text, action }: { text: string; action?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f7fc] p-5">
      <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
        <Image
          alt="Starlim"
          className="mx-auto h-auto w-32 rounded-xl bg-[#075ac7] p-3"
          height={60}
          src="/starlim-logo-white.png"
          width={150}
        />
        <p className="mt-6 font-bold">{text}</p>
        {action ? (
          <Link
            className="mt-5 inline-flex rounded-xl bg-[#075ac7] px-5 py-3 font-black text-white"
            href="/portal"
          >
            {action}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
