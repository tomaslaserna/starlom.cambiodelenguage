export type VerifiedProductImageSource = {
  productId: string;
  productName: string;
  brand: string;
  sourcePage: string;
  sourceUrl: string;
};

// Every entry is manually checked against the exact product, variety and presentation.
// The API only imports URLs declared here; clients cannot provide arbitrary remote URLs.
export const VERIFIED_PRODUCT_IMAGE_SOURCES: VerifiedProductImageSource[] = [
  {
    productId: "968a46db-f046-48c4-8ba8-b15c0ae7393e",
    productName: "BLEM AEROSOL LIMÓN ACERO/METAL 360 ML",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/expert-care/aerosol-lemon",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/cuidado-experto/acero-inoxidable-y-metal-limon-en-aerosol/pledge_ar-7_25-acerio_inoxidable_y_metal_limon_aerosol.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "c1ebd9a4-a4b9-43ba-91a7-ffb59db6d7cc",
    productName: "BLEM AEROSOL NARANJA GRANITO 360 ML",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/expert-care/aerosol-orange",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/cuidado-experto/granito-y-marmol-naranja-en-aerosol/pledge_ar-7_25-granito_marmol_naranja_aerosol.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "471c8b00-66bf-4c66-8dd1-93cee3714acc",
    productName: "BLEM MADERA LAVANDA 360 ML/12 AR",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/expert-care/aerosol-lavender",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/limpieza-diaria/lustramuebles-lavanda-en-aerosol/pledge_ar-7_25-lustramuebles_lavanda_aerosol.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "68f2a0e6-4d74-40c1-ad2f-72acfa8afe97",
    productName: "BLEM MADERA ORIGINAL 360 ML/12 AR",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/expert-care/aerosol-original",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/cuidado-experto/lustramuebles-original-en-aerosol/pledge_ar-7_25-lustramuebles_original_aerosol.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "64c42c98-c3ba-4dfa-acc8-b3f0d2701e23",
    productName: "BLEM MULTI GATILLO CITRUS 400 ML/12 AR",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/everyday-clean/ph-balanced-multisurface-cleaner-spray-citrus",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/2025/pledge_ar_multi_citrus_spray.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "66cea9a4-e93b-417f-8b24-6fab5a91d6d7",
    productName: "BLEM MULTI GATILLO FLORAL 400 ML/12 AR",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/everyday-clean/multisurface-and-electronics-floral-spray",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/2025/pledge_ar_multi_floral_spray.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "789e86a6-f370-4370-a946-6b2e8907d433",
    productName: "BLEM RENUEVA MADERA PREMIUM ARGÁN 360 ML",
    brand: "Blem",
    sourcePage: "https://blem.com.ar/es-ar/products/expert-care/renewing-aerosol",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/pledge/argentina/product-detail-pages/cuidado-experto/lustramuebles-argan-en-aerosol/pledge_ar-7_25-lustramuebles_argan_aerosol.webp?h=990&iar=0&w=1760",
  },
];

export function verifiedProductImageSource(productId: string) {
  return VERIFIED_PRODUCT_IMAGE_SOURCES.find((entry) => entry.productId === productId) ?? null;
}
