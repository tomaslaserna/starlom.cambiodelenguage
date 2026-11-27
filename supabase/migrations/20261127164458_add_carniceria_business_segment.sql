-- Add a category without changing any existing customer classification.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_business_segment_check,
  ADD CONSTRAINT clients_business_segment_check CHECK (business_segment IS NULL OR business_segment IN (
    'Restaurante', 'Carnicería', 'Cafetería', 'Bar', 'Salón de eventos',
    'Cancha o club deportivo', 'Consorcio', 'Fábrica o industria', 'Salud o rehabilitación',
    'Hotelería', 'Comercio', 'Empresa de limpieza', 'Institución', 'Otro'
  )),
  DROP CONSTRAINT IF EXISTS clients_business_segment_suggested_check,
  ADD CONSTRAINT clients_business_segment_suggested_check CHECK (business_segment_suggested IS NULL OR business_segment_suggested IN (
    'Restaurante', 'Carnicería', 'Cafetería', 'Bar', 'Salón de eventos',
    'Cancha o club deportivo', 'Consorcio', 'Fábrica o industria', 'Salud o rehabilitación',
    'Hotelería', 'Comercio', 'Empresa de limpieza', 'Institución', 'Otro'
  ));
ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_business_segment_check,
  ADD CONSTRAINT crm_leads_business_segment_check CHECK (business_segment IS NULL OR business_segment IN (
    'Restaurante', 'Carnicería', 'Cafetería', 'Bar', 'Salón de eventos',
    'Cancha o club deportivo', 'Consorcio', 'Fábrica o industria', 'Salud o rehabilitación',
    'Hotelería', 'Comercio', 'Empresa de limpieza', 'Institución', 'Otro'
  ));
