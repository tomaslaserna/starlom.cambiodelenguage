import { localDateIso } from "@/lib/timezone";
import { priceForList, type ProductPriceMap } from "@/lib/order-pricing";

export type SegmentGuidePeriod = { from: string; until: string; through: string; generatedOn: string };
export type SegmentGuideRow = {
  segment: string; customer_count: string; order_count: string;
  product_id: string | null; product_name: string | null; product_code: string | null;
  presentation_units: string | null; buyers: string | null;
  product_orders: string | null; average_quantity: string | null;
};
export type SegmentGuideProduct = {
  productId: string; name: string; code: string; presentationUnits: number;
  averageQuantity: number; quantity: number; buyerCount: number; orderCount: number;
  coveragePercent: number; habitual: boolean;
};
export type SegmentGuideGroup = {
  segment: string; customerCount: number; orderCount: number; preliminary: boolean;
  products: SegmentGuideProduct[];
};
export type SegmentGuide = { period: SegmentGuidePeriod; segments: SegmentGuideGroup[] };

export function segmentGuidePeriod(now = new Date()): SegmentGuidePeriod {
  const today = localDateIso(now);
  const shift = (days: number) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
  };
  return { from: shift(-90), until: today, through: shift(-1), generatedOn: today };
}

export function buildSegmentGuide(rows: SegmentGuideRow[], registered: readonly string[], period: SegmentGuidePeriod): SegmentGuide {
  const groups = new Map<string, SegmentGuideGroup>();
  for (const segment of [...registered, ...rows.map(row => row.segment)]) {
    if (segment && !groups.has(segment)) groups.set(segment, {segment, customerCount: 0, orderCount: 0, preliminary: true, products: []});
  }
  for (const row of rows) {
    const group = groups.get(row.segment);
    if (!group) continue;
    group.customerCount = Number(row.customer_count) || 0;
    group.orderCount = Number(row.order_count) || 0;
    group.preliminary = group.customerCount < 5;
    const average = Number(row.average_quantity);
    if (!row.product_id || !Number.isFinite(average) || average <= 0) continue;
    const buyers = Number(row.buyers) || 0;
    const coverage = group.customerCount ? buyers / group.customerCount * 100 : 0;
    group.products.push({
      productId: row.product_id, name: row.product_name || "Producto", code: row.product_code || "",
      presentationUnits: Math.max(1, Number(row.presentation_units) || 1),
      averageQuantity: average, quantity: Math.max(1, Math.round(average)),
      buyerCount: buyers, orderCount: Number(row.product_orders) || 0,
      coveragePercent: coverage, habitual: buyers >= 2 || coverage >= 20,
    });
  }
  for (const group of groups.values()) group.products.sort((a,b) => b.buyerCount-a.buyerCount || b.orderCount-a.orderCount || a.name.localeCompare(b.name,"es") || a.productId.localeCompare(b.productId));
  return {period, segments: [...groups.values()].sort((a,b)=>a.segment.localeCompare(b.segment,"es"))};
}

export function segmentBaseLines(group: SegmentGuideGroup): SegmentGuideProduct[] {
  return group.products.filter(product => product.habitual).slice(0, 20);
}

export function pricedSegmentBase(group: SegmentGuideGroup, products: {id: string; prices: ProductPriceMap}[], priceList: string) {
  const byId = new Map(products.map(product=>[product.id,product]));
  const lines: {productId: string; quantity: string; discount: string}[] = [];
  const unavailable: string[] = [];
  for (const product of segmentBaseLines(group)) {
    const current = byId.get(product.productId);
    const price = current ? priceForList(current.prices, priceList) : 0;
    if (!Number.isFinite(price) || price <= 0) { unavailable.push(product.name); continue; }
    lines.push({productId: product.productId, quantity: String(product.quantity), discount: "0"});
  }
  return {lines, unavailable};
}
