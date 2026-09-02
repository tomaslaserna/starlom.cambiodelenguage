export const CUSTOMER_BUSINESS_SEGMENTS = [
  "Restaurante", "Cafetería", "Bar", "Salón de eventos", "Cancha o club deportivo",
  "Consorcio", "Fábrica o industria", "Salud o rehabilitación", "Hotelería", "Comercio",
  "Empresa de limpieza", "Institución", "Otro",
] as const;

export type CustomerBusinessSegment = (typeof CUSTOMER_BUSINESS_SEGMENTS)[number];

