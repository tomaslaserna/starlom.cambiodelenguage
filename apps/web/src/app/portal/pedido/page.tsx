import type { Metadata } from "next";
import { PortalOrderBuilder } from "./portal-order-builder";

export const metadata: Metadata = { title: "Armar pedido | Portal Starlim" };

export default async function PortalOrderPage({ searchParams }: { searchParams: Promise<{ clientId?: string; repeatSaleId?: string }> }) {
  const params = await searchParams;
  return <PortalOrderBuilder clientId={params.clientId ?? ""} repeatSaleId={params.repeatSaleId ?? ""} />;
}
