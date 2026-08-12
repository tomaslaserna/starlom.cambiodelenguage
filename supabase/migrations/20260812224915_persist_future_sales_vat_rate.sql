-- Esquema para ventas nuevas. Esta migracion no recalcula ni modifica ventas historicas.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- La alicuota fiscal es una foto de lo efectivamente autorizado. Queda NULL
-- para CAE historicos, que continuan interpretandose con la regla anterior.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fiscal_vat_rate NUMERIC(5,2);

ALTER TABLE public.sales_internal_documents
  ADD COLUMN IF NOT EXISTS fiscal_vat_rate NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales'::regclass
      AND conname = 'sales_vat_rate_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_vat_rate_check
      CHECK (vat_rate IN (0, 10.5, 21)) NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales'::regclass
      AND conname = 'sales_fiscal_vat_rate_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_fiscal_vat_rate_check
      CHECK (fiscal_vat_rate IS NULL OR fiscal_vat_rate IN (0, 10.5, 21)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales_internal_documents'::regclass
      AND conname = 'sales_internal_documents_fiscal_vat_rate_check'
  ) THEN
    ALTER TABLE public.sales_internal_documents
      ADD CONSTRAINT sales_internal_documents_fiscal_vat_rate_check
      CHECK (fiscal_vat_rate IS NULL OR fiscal_vat_rate IN (0, 10.5, 21)) NOT VALID;
  END IF;
END
$$;

COMMENT ON COLUMN public.sales.vat_rate IS
  'Alicuota de IVA de la venta. La aplicacion exige 10.5 o 21 para operaciones nuevas; 0 se conserva para compatibilidad historica.';

COMMENT ON COLUMN public.sales.fiscal_vat_rate IS
  'Alicuota efectivamente enviada al autorizar el comprobante. NULL identifica autorizaciones historicas previas a esta correccion.';

COMMENT ON COLUMN public.sales_internal_documents.fiscal_vat_rate IS
  'Alicuota efectivamente enviada al autorizar la nota fiscal. NULL identifica autorizaciones historicas previas a esta correccion.';

-- Snapshot semantico para presupuestos futuros. No se infiere ni actualiza
-- ningun presupuesto historico: los existentes conservan cadena vacia.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS desired_document TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass
      AND conname = 'quotes_desired_document_check'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_desired_document_check
      CHECK (desired_document IN ('', 'remito', 'factura_a', 'factura_b')) NOT VALID;
  END IF;
END
$$;

COMMENT ON COLUMN public.quotes.desired_document IS
  'Comprobante configurado en el cliente al crear el presupuesto. Vacio identifica presupuestos historicos sin snapshot; no se completa por inferencia.';
