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
  {
    productId: "202fddeb-9de3-41d0-9f84-5cecfbcf1c87",
    productName: "LYSOFORM AERO ON THE GO ORIGINAL 55 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/aerosoles/para-llevar/lysoform_ar-7_25-aerosol_para_llevar-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "3b93f8d4-2592-43f3-a763-5fb2f443fc19",
    productName: "LYSOFORM AEROSOL BEBÉ 360 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/lysoform_ar-9_25-aerosol_desinfectante_bebe-285.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "ddff6a9f-83e6-4b29-b6a3-a3b2a0834c08",
    productName: "LYSOFORM AEROSOL LAVANDA 285 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-aerosol-lavanda-285.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "eebfa98f-e3ec-4e0a-a6b1-c66a2d35cc36",
    productName: "LYSOFORM AEROSOL ULTRALIVIANO LAVANDA 315 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante-ultraliviano",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/aerosoles/ultraliviano-lavanda/lysoform_ar-7_25-aerosol_ultraliviano_lavanda-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "9525d9ea-3d32-4eb9-85bf-e8efb706deaa",
    productName: "LYSOFORM AEROSOL LAVANDA 360 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/aerosoles/lavanda/lysoform_ar-7_25-aerosol_lavanda-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "f8fe0b9f-4a2f-46b5-9655-296d48779b0c",
    productName: "LYSOFORM AEROSOL LAVANDA 495 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-aerosol-lavanda-495.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "f04d6d8a-8016-472d-aaab-0323ad8a20d7",
    productName: "LYSOFORM AEROSOL ORIGINAL 285 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-aerosol-original-285.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "52a24ee0-6b29-470e-b658-b6420e2e5231",
    productName: "LYSOFORM AEROSOL ULTRALIVIANO ORIGINAL 315 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/air-care/aerosol-desinfectante-ultraliviano",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/aerosoles/ultraliviano-original/lysoform_ar-7_25-aerosol_ultraliviano_original-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "24c44076-a265-4172-902d-5491dd4977d4",
    productName: "LYSOFORM BAÑO DOYPACK 450 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/bano",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-bano-dp-450.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "cf4074bc-2d1d-4a47-8e33-4a0bb5401508",
    productName: "LYSOFORM BAÑO GATILLO 500 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/bano",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/bano/lysoform_ar-7_25-limpiadores_bano-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "5b569768-35bf-4ec0-91cb-ba02f3ff7d57",
    productName: "LYSOFORM CONCENTRADO BEBÉ DOYPACK 420 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/concentrado-bebe/lysoform_ar-7_25-limpiadores_concentrado_bebe-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "230b3158-db0a-4350-baa3-f3135a8262d2",
    productName: "LYSOFORM CONCENTRADO CÍTRICA DOYPACK 420 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/concentrado-citrus/lysoform_ar-7_25-limpiadores_concentrado_citrus-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "c09aeb50-a09e-49fd-938b-e1c81f3887de",
    productName: "LYSOFORM CONCENTRADO LAVANDA DOYPACK 420 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-limpiador-desinfectante-concentrado-lavanda-420.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "53470edf-e2d2-4755-8d5b-85e1d0a6f443",
    productName: "LYSOFORM CONCENTRADO ORIGINAL DOYPACK 420 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-limpiador-desinfectante-concentrado-original-420.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "717c3f3e-e0d7-4bb7-b8da-08beb786be07",
    productName: "LYSOFORM CREMOSO 450 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/crema-multiuso",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/crema-multiuso/lysoform_ar-7_25-crema_multiuso-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "4ff9851b-ae09-4d87-b29c-11aebae27659",
    productName: "LYSOFORM LIMPIADOR LÍQUIDO LAVANDA BOTELLA 800 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/concentrado-lavanda/lysoform_ar-7_25-limpiadores_concentrado_lavanda-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "a3436130-bf6c-4306-a74d-5538f1a495e5",
    productName: "LYSOFORM LIMPIADOR LÍQUIDO ORIGINAL BOTELLA 800 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/limpiador-desinfectante-concentrado",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/product-detail-pages/limpiadores/concentrado-original/lysoform_ar-7_25-limpiadores_concentrado_original-1.webp?h=990&iar=0&w=1760",
  },
  {
    productId: "1704b46c-f0a8-4082-bc44-3f66abf0f34c",
    productName: "LYSOFORM MULTISUPERFICIES DOYPACK 450 ML",
    brand: "Lysoform",
    sourcePage: "https://lysoform.com.ar/es-ar/products/home-cleaning-disinfecting/multisuperficies",
    sourceUrl: "https://edge.sitecorecloud.io/scjohnsonana080-dart-production-40df/media/project/dart/lysoform/argentina/dsc-images/updated-product-detail-images/home-cleaning-disinfecting/10-10-25/lysoform-multisuperficies-dp-450.webp?h=990&iar=0&w=1760",
  },
];

export function verifiedProductImageSource(productId: string) {
  return VERIFIED_PRODUCT_IMAGE_SOURCES.find((entry) => entry.productId === productId) ?? null;
}
