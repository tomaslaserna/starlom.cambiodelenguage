import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductsPreview } from "./products-preview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vista de muestra de productos | Starlim",
  robots: {
    follow: false,
    index: false,
  },
};

export default function ProductsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <ProductsPreview />;
}
