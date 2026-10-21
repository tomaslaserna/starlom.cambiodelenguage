import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("los tres canales generan solicitudes y no pedidos directos",async()=>{
  const store=await read("src/app/api/storefront/requests/route.ts");
  const portal=await read("src/app/api/portal/order-builder/route.ts");
  const service=await read("src/lib/storefront.ts");
  assert.doesNotMatch(store,/convertStorefrontQuoteToOrder/);
  assert.doesNotMatch(portal,/acceptQuote\(/);
  assert.match(portal,/INSERT INTO order_requests/);
  assert.match(service,/INSERT INTO order_requests/);
});

test("operaciones expone solicitudes y la aprobación crea el pedido",async()=>{
  const orders=await read("src/app/orders/page.tsx");
  const requestService=await read("src/lib/order-requests.ts");
  assert.match(orders,/\/orders\/requests/);
  assert.match(requestService,/acceptQuote\(session, request\.quote_id\)/);
  assert.match(requestService,/status='aprobada'/);
});

test("tienda tiene métricas, búsqueda por tokens y catálogo acotado",async()=>{
  const nav=await read("src/lib/navigation.ts");
  const store=await read("src/app/store/page.tsx");
  const storefront=await read("src/app/tienda/storefront.tsx");
  assert.match(nav,/label: "Tienda y Portal"/);
  assert.match(nav,/icon: "eye"/);
  assert.match(store,/Visualizaciones/);
  assert.match(store,/Checkouts iniciados y no terminados/);
  assert.match(store,/Hablar por WhatsApp/);
  assert.match(storefront,/needles\.every/);
  assert.match(storefront,/visibleLimit/);
  assert.match(storefront,/Mostrar también productos sin stock/);
});

test("tienda y portal cierran el checkout al generar una solicitud",async()=>{
  const migration=await read("../../supabase/migrations/20261021230101_storefront_checkout_sessions.sql");
  const store=await read("src/lib/storefront.ts");
  const portal=await read("src/app/api/portal/order-builder/route.ts");
  assert.match(migration,/CREATE TABLE public\.storefront_checkout_sessions/);
  assert.match(store,/status='enviada'/);
  assert.match(portal,/status='enviada'/);
  assert.match(store,/analyticsSessionId/);
  assert.match(portal,/analyticsSessionId/);
});
