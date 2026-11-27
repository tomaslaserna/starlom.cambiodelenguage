import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { QUOTES_CREATE_PERMISSION } from "@/lib/route-auth";
import { getSegmentGuide } from "@/lib/segment-guide";
import { pricedSegmentBase, segmentBaseLines } from "@/lib/segment-guide-domain";
import { getOrderFormData } from "@/lib/orders";
import { priceForList, resolvePriceListName } from "@/lib/order-pricing";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

export default async function BaseQuotesPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [QUOTES_CREATE_PERMISSION]);
  const [guide, form] = await Promise.all([getSegmentGuide(session.companyId), getOrderFormData(session.companyId)]);
  const priceList = resolvePriceListName("", form.priceLists);
  const products = new Map(form.products.map(product => [product.id, product]));
  return (
    <ModulePage active="sales" description="Puntos de partida basados en compras reales por rubro." session={session} title="Presupuestos base">
      <div className="grid gap-5">
        <PageHeader title="Presupuestos base" description="Elegí un rubro, revisá la sugerencia y adaptala al cliente antes de enviarla."
          actions={<ButtonLink href="/quotes" variant="secondary">Volver a presupuestos</ButtonLink>} />
        <Card className="grid gap-2 p-4 text-sm">
          <p><strong>Historial:</strong> {formatDate(guide.period.from)} al {formatDate(guide.period.through)} · 90 días completos · cálculo {formatDate(guide.period.generatedOn)}.</p>
          <p>Cantidad promedio por pedido que incluyó cada producto, redondeada a unidades vendibles. No representa consumo mensual ni una canasta que todos compren junta.</p>
          <p>Hasta 20 productos habituales: al menos 2 compradores o el 20% de los compradores del rubro. Los rubros de menos de 5 compradores son preliminares.</p>
          <p>Precios netos vigentes de referencia: <strong>{priceList}</strong>. Al abrir podés cambiar lista, comprobante, productos y cantidades. El IVA se calcula en el presupuesto.</p>
          <a className="font-semibold text-blue-700 underline" href="/api/bank/segment-guide" target="_blank" rel="noreferrer">Ver guía completa por rubro — PDF</a>
        </Card>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {guide.segments.map(group => {
            const selected = segmentBaseLines(group);
            const priced = pricedSegmentBase(group, form.products, priceList);
            const selectedIds = new Set(priced.lines.map(line => line.productId));
            const total = selected.reduce((sum, product) => sum + (selectedIds.has(product.productId) ? priceForList(products.get(product.productId)!.prices, priceList) * product.quantity : 0), 0);
            return <Card key={group.segment} className="grid gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{group.segment}</h2>
                {group.products.length ? <span className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">{group.preliminary ? "Base preliminar" : "Con historial"}</span> : null}
              </div>
              <p className="text-sm text-[color:var(--muted)]">{group.customerCount} clientes compradores · {group.orderCount} pedidos con productos activos, netos de devoluciones.</p>
              {group.products.length ? <>
                {group.preliminary ? <p className="text-sm text-amber-800">Muestra pequeña: validá las cantidades y necesidades con el cliente.</p> : null}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Ver {selected.length} productos sugeridos</summary>
                  <ul className="mt-3 grid gap-2 text-sm">
                    {selected.map(product => <li key={product.productId} className="border-b border-slate-100 pb-2">
                      <p className="font-semibold">{product.quantity} × {product.name}</p>
                      <p className="text-xs text-[color:var(--muted)]">Promedio {formatNumber(product.averageQuantity)} unidades por pedido con este producto · {product.orderCount} pedidos · {product.buyerCount}/{group.customerCount} compradores ({formatNumber(product.coveragePercent)}%).</p>
                      <p>{selectedIds.has(product.productId) ? `${formatCurrency(priceForList(products.get(product.productId)!.prices, priceList))} netos por unidad` : "Sin precio vigente: no se precarga"}</p>
                    </li>)}
                  </ul>
                </details>
                {priced.unavailable.length ? <p className="text-sm text-amber-800">{priced.unavailable.length} productos sin precio vigente o no disponibles en catálogo; se excluyen al abrir.</p> : null}
                <p className="text-sm font-semibold">Estimado neto de la base: {formatCurrency(total)}</p>
                {priced.lines.length ? <ButtonLink href={`/quotes/new?base=${encodeURIComponent(group.segment)}`}>Usar base de {group.segment}</ButtonLink>
                  : <p className="text-sm text-amber-800">No hay productos habituales con precio vigente para precargar.</p>}
              </> : <p className="text-sm text-[color:var(--muted)]">Sin historial suficiente. Clasificá clientes en este rubro y registrá compras entregadas para generar su base.</p>}
            </Card>;
          })}
        </div>
      </div>
    </ModulePage>
  );
}
