ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS business_segment text,
  ADD COLUMN IF NOT EXISTS business_segment_suggested text,
  ADD COLUMN IF NOT EXISTS business_segment_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS business_segment_reviewed_at timestamptz;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_business_segment_check,
  ADD CONSTRAINT clients_business_segment_check CHECK (
    business_segment IS NULL OR business_segment IN (
      'Restaurante', 'Cafetería', 'Bar', 'Salón de eventos',
      'Cancha o club deportivo', 'Consorcio', 'Fábrica o industria',
      'Salud o rehabilitación', 'Hotelería', 'Comercio',
      'Empresa de limpieza', 'Institución', 'Otro'
    )
  ),
  DROP CONSTRAINT IF EXISTS clients_business_segment_suggested_check,
  ADD CONSTRAINT clients_business_segment_suggested_check CHECK (
    business_segment_suggested IS NULL OR business_segment_suggested IN (
      'Restaurante', 'Cafetería', 'Bar', 'Salón de eventos',
      'Cancha o club deportivo', 'Consorcio', 'Fábrica o industria',
      'Salud o rehabilitación', 'Hotelería', 'Comercio',
      'Empresa de limpieza', 'Institución', 'Otro'
    )
  ),
  DROP CONSTRAINT IF EXISTS clients_business_segment_confidence_check,
  ADD CONSTRAINT clients_business_segment_confidence_check CHECK (
    business_segment_confidence IS NULL OR business_segment_confidence BETWEEN 0 AND 1
  );

WITH inferred AS (
  SELECT id,
    CASE
      WHEN source ~ '(cafeter|coffee)' THEN 'Cafetería'
      WHEN source ~ '(restaurant|restaurante|resto|parrilla|pizzeria|pizzería|sushi)' THEN 'Restaurante'
      WHEN source ~ '(^|[^a-z])(bar|pub)([^a-z]|$)' THEN 'Bar'
      WHEN source ~ '(salon de evento|salón de evento|eventos|quinta)' THEN 'Salón de eventos'
      WHEN source ~ '(padel|pádel|futbol|fútbol|cancha|club deportivo|gimnasio)' THEN 'Cancha o club deportivo'
      WHEN source ~ '(consorcio|edificio|complejo|barrio privado)' THEN 'Consorcio'
      WHEN source ~ '(fabrica|fábrica|industria|industrial|metalurg|planta)' THEN 'Fábrica o industria'
      WHEN source ~ '(rehabilit|clinica|clínica|salud|geriatr|sanatorio|consultorio)' THEN 'Salud o rehabilitación'
      WHEN source ~ '(hotel|hostel|apart hotel|cabaña)' THEN 'Hotelería'
      WHEN source ~ '(limpieza|higiene)' THEN 'Empresa de limpieza'
      WHEN source ~ '(colegio|escuela|universidad|fundacion|fundación|instituto)' THEN 'Institución'
      WHEN source ~ '(kiosco|almacen|almacén|supermercado|comercio|local)' THEN 'Comercio'
      ELSE NULL
    END AS segment
  FROM (
    SELECT id, lower(concat_ws(' ', display_name, legal_name, notes)) AS source
    FROM public.clients
  ) normalized
)
UPDATE public.clients c
SET business_segment_suggested = inferred.segment,
    business_segment_confidence = CASE WHEN inferred.segment IS NULL THEN NULL ELSE 0.850 END
FROM inferred
WHERE c.id = inferred.id
  AND c.business_segment IS NULL
  AND inferred.segment IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_empresa_business_segment_idx
  ON public.clients (empresa_id, business_segment)
  WHERE business_segment IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_empresa_business_segment_suggested_idx
  ON public.clients (empresa_id, business_segment_suggested)
  WHERE business_segment IS NULL AND business_segment_suggested IS NOT NULL;

ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS business_segment text;
ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_business_segment_check,
  ADD CONSTRAINT crm_leads_business_segment_check CHECK (business_segment IS NULL OR business_segment IN (
    'Restaurante', 'Cafetería', 'Bar', 'Salón de eventos', 'Cancha o club deportivo',
    'Consorcio', 'Fábrica o industria', 'Salud o rehabilitación', 'Hotelería', 'Comercio',
    'Empresa de limpieza', 'Institución', 'Otro'));
CREATE INDEX IF NOT EXISTS crm_leads_empresa_business_segment_idx ON public.crm_leads (empresa_id, business_segment) WHERE business_segment IS NOT NULL;
