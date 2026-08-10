import { redirect } from "next/navigation";

type PricingPageProps = {
  searchParams: Promise<{ mode?: string }>;
};

// El módulo de precios se reorganizó en el submenú "Precios". Esta ruta queda
// como redirección para no romper enlaces guardados.
export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  if (params.mode === "bulk") redirect("/stock?mode=bulk");
  if (params.mode === "new-product") redirect("/prices/new");
  redirect("/prices");
}
