BEGIN;

-- The QR payload must use the exact CbteFch sent to ARCA. Authorization time is
-- kept separately because it is an event timestamp, not the fiscal issue date.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fiscal_issue_date date;

ALTER TABLE public.sales_internal_documents
  ADD COLUMN IF NOT EXISTS fiscal_issue_date date;

UPDATE public.sales
SET fiscal_issue_date = COALESCE(
      (fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      sale_date
    )
WHERE fiscal_issue_date IS NULL
  AND COALESCE(fiscal_status, 'no_enviado') = 'aprobado'
  AND COALESCE(cae, '') NOT IN ('', 'manual');

UPDATE public.sales_internal_documents
SET fiscal_issue_date = COALESCE(
      (fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      created_at::date
    )
WHERE fiscal_issue_date IS NULL
  AND COALESCE(fiscal_status, 'no_enviado') = 'aprobado'
  AND COALESCE(cae, '') NOT IN ('', 'manual');

CREATE INDEX IF NOT EXISTS sales_empresa_fiscal_issue_date_idx
  ON public.sales (empresa_id, fiscal_issue_date)
  WHERE fiscal_issue_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_internal_documents_empresa_fiscal_issue_date_idx
  ON public.sales_internal_documents (empresa_id, fiscal_issue_date)
  WHERE fiscal_issue_date IS NOT NULL;

COMMENT ON COLUMN public.sales.fiscal_issue_date IS
  'Fecha CbteFch enviada y autorizada por ARCA; fuente de verdad para el PDF y su QR.';

COMMENT ON COLUMN public.sales_internal_documents.fiscal_issue_date IS
  'Fecha CbteFch enviada y autorizada por ARCA para la nota fiscal.';

-- Recover the line items omitted by the July Drive header import. The repair is
-- idempotent and only runs when a matching sale has no existing line items. A
-- sale is repaired only when every source description resolves to a product.
-- Cent-level source rounding is allocated across line totals so their sum equals
-- the net amount authorized from each sale's VAT-inclusive total.
WITH source_items (
  sale_number,
  source_sheet,
  source_row,
  description,
  quantity,
  unit_price,
  total_amount
) AS (
  VALUES
    ('REM-2026-1064', 'REMITO_REM-2026-1064', 20, 'BOLSA COMPACTADORA(90x120/23)ABASTO x10u', 2.000, 2544.18, 5088.36),
    ('REM-2026-1064', 'REMITO_REM-2026-1064', 21, 'ESCOBILLON SUPERPAN MAX', 1.000, 3418.18, 3418.19),
    ('REM-2026-1064', 'REMITO_REM-2026-1064', 22, 'BLEM MADERA ORIGINAL 360 ML/12 AR', 1.000, 6612.00, 6612.00),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 20, 'DETERGENTE TIPO AMARILLO X 5 LTS', 10.000, 8619.00, 86190.00),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 21, 'DESENGRASANTE IND. SB5 X 5 LTS', 6.000, 4347.38, 26084.27),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 22, 'DESOD. P/PISOS ARPEGE X 5 LTS', 2.000, 4077.91, 8155.81),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 23, 'HIPOCLORITO DE SODIO 55GR/L X 5 LTS', 6.000, 5085.29, 30511.74),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 24, 'GUANTE NITRILO NEGRO TALLE  M', 1.000, 10323.21, 10323.21),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 25, 'REJILLA P/URINAL PERFUMADO UPPRO', 10.000, 1811.33, 18113.32),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 26, 'REJILLA ESPONJA N36 33X45 AF', 15.000, 1179.87, 17698.12),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 27, 'ESPONJA CON SALVA UÑAS FLEXOL ', 5.000, 656.00, 3280.00),
    ('REM-2026-1066', 'REMITO_REM-2026-1066', 28, 'BOBINA INDUSTRIAL BLANCA 20 CM SIMPLE HOJA', 4.000, 13123.05, 52492.19),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 20, 'DESENGRASANTE IND. SB5 X 5 LTS', 5.000, 4347.38, 21736.89),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 21, 'DESODORANTE P/PISOS BASE X  LTS 1+90', 2.000, 13647.58, 27295.17),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 22, 'REJILLA AUTO SEMI PESADA 48 X 58 AF', 4.000, 2390.31, 9561.23),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 23, 'HIPOCLORITO DE SODIO 55GR/L X 5 LTS', 2.000, 5085.29, 10170.58),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 24, 'SECADOR DOBLE GOMA 40CM PLUS AF', 2.000, 2324.46, 4648.91),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 25, 'TRAPO DE PISO GRIS 48X62 CM AF', 3.000, 1191.74, 3575.21),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 26, 'ESPONJA PLASTICA CERO RAYAS', 10.000, 1724.06, 17240.59),
    ('REM-2026-1068', 'REMITO_REM-2026-1068', 27, 'GUANTE NITRILO NEGRO TALLE  M', 1.000, 10323.21, 10323.21),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 20, 'GUANTE NITRILO NEGRO TALLE  M', 1.000, 10323.21, 10323.21),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 21, 'REJILLA TRIPLE COLOR LN36', 10.000, 1071.79, 10717.89),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 22, 'MOPIN ALGODON PUNTA CORTADA 130GR AF', 2.000, 2463.91, 4927.82),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 23, 'Glade Aerosol Placer Floral y FR 255 ML', 3.000, 3296.06, 9888.19),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 24, 'TRAPO DE PISO GRIS 48X62 CM AF', 2.000, 1191.74, 2383.47),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 25, 'REJILLA P/URINAL PERFUMADO UPPRO', 5.000, 1811.33, 9056.66),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 26, 'BOBINA INDUSTRIAL BLANCA 20 CM SIMPLE HOJA', 3.000, 13123.05, 39369.14),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 27, 'HIPOCLORITO DE SODIO 33GR/L X 5 LTS', 4.000, 4086.32, 16345.29),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 28, 'DESENGRASANTE IND. SB5 X 5 LTS', 4.000, 4347.38, 17389.51),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 29, 'DESOD. P/PISOS ARPEGE X 5 LTS', 2.000, 4077.91, 8155.81),
    ('REM-2026-1069', 'REMITO_REM-2026-1069', 30, 'DETERGENTE TIPO AMARILLO X 5 LTS', 6.000, 8619.00, 51714.00),
    ('REM-2026-1070', 'REMITO_REM-2026-1070', 20, 'AEROSOL SAPHIRUS ', 2.000, 7104.00, 14208.00),
    ('REM-2026-1070', 'REMITO_REM-2026-1070', 21, 'PATO BLOQUE PARA MOCHILA 24 X 40 GR', 5.000, 3891.76, 19458.80),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 20, 'DESENGRASANTE IND. SB5 X 5 LTS', 1.000, 4347.38, 4347.38),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 21, 'DESOD. P/PISOS ARPEGE X 5 LTS', 2.000, 4077.91, 8155.81),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 22, 'HIPOCLORITO DE SODIO 55GR/L X 5 LTS', 1.000, 5085.29, 5085.29),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 23, 'CAJA TOALLA INTERCALADA EXTRA  BLANCA X2500', 1.000, 20343.95, 20343.95),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 24, 'HIGIENICO BLANCO INDUSTRIAL CONO GRANDE', 1.000, 13645.90, 13645.90),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 25, 'BOLSA RESIDUOS(45x60/15)ABASTO x30u', 1.000, 1345.86, 1345.86),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 26, 'BOLSA CONSORCIO(60x90/20)ABASTO x10u', 2.000, 1119.75, 2239.50),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 27, 'BOLSA COMPACTADORA(90x120/23)ABASTO x10u', 2.000, 2544.18, 5088.36),
    ('REM-2026-1071', 'REMITO_REM-2026-1071', 28, 'GUANTE LATEX  CHICO CAJA 100U (10)', 1.000, 8726.69, 8726.69),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 20, 'OFERTA-ROLLO PVC (45x 600) NOBLEZA xU', 2.000, 21007.50, 42015.00),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 21, 'CAJA SERVILLETA 33X33 BLANCA X 1000', 4.000, 12903.78, 51615.13),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 22, 'BOBINA INDUSTRIAL BLANCA 20 CM SIMPLE HOJA', 2.000, 13123.05, 26246.10),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 23, 'JABON EN PAN BLANCO X 200 GR', 4.000, 735.10, 2940.40),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 24, 'HIPOCLORITO DE SODIO 33GR/L X 5 LTS', 2.000, 4086.32, 8172.64),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 25, 'GUANTE NITRILO NEGRO TALLE  M', 5.000, 10323.21, 51616.07),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 26, 'LAMINA AD (25x37) xKg', 3.000, 10152.99, 30458.97),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 27, 'BOLSA CAMISETA (40x50)POLYFILM MAMUT REF', 5.000, 6094.71, 30473.55),
    ('REM-2026-1072', 'REMITO_REM-2026-1072', 28, 'BOLSA CAMISETA (60x80)POLYFILM MAMUT REF', 5.000, 23283.00, 116415.00)
),
eligible_sales AS (
  SELECT s.id, s.empresa_id, s.sale_number
  FROM public.sales s
  WHERE s.sale_number IN (SELECT DISTINCT sale_number FROM source_items)
    AND NOT EXISTS (
      SELECT 1
      FROM public.sale_items existing
      WHERE existing.sale_id = s.id
        AND existing.empresa_id = s.empresa_id
    )
),
resolved_items AS (
  SELECT es.id AS sale_id,
         es.empresa_id,
         src.sale_number,
         src.source_sheet,
         src.source_row,
         src.description,
         src.quantity,
         src.unit_price,
         src.total_amount,
         (
           SELECT p.id
           FROM public.products p
           WHERE p.empresa_id = es.empresa_id
             AND COALESCE(p.active, true) = true
             AND regexp_replace(lower(trim(p.name)), '\s+', ' ', 'g')
               = regexp_replace(lower(trim(src.description)), '\s+', ' ', 'g')
           ORDER BY p.id
           LIMIT 1
         ) AS product_id
  FROM eligible_sales es
  JOIN source_items src ON src.sale_number = es.sale_number
),
complete_sales AS (
  SELECT resolved.sale_id
  FROM resolved_items resolved
  GROUP BY resolved.sale_id, resolved.sale_number
  HAVING COUNT(resolved.product_id) = (
    SELECT COUNT(*)
    FROM source_items expected
    WHERE expected.sale_number = resolved.sale_number
  )
),
inserted AS (
  INSERT INTO public.sale_items (
    sale_id,
    product_id,
    description,
    quantity,
    unit_price,
    discount,
    total_amount,
    empresa_id,
    source_sheet,
    source_row
  )
  SELECT resolved.sale_id,
         resolved.product_id,
         resolved.description,
         resolved.quantity,
         resolved.unit_price,
         0,
         resolved.total_amount,
         resolved.empresa_id,
         resolved.source_sheet,
         resolved.source_row
  FROM resolved_items resolved
  JOIN complete_sales complete ON complete.sale_id = resolved.sale_id
  ORDER BY resolved.sale_number, resolved.source_row
  RETURNING sale_id, empresa_id
)
INSERT INTO public.eventos_integracion (tipo, datos, empresa_id)
SELECT 'drive.sale_items_backfilled',
       jsonb_build_object(
         'saleId', inserted.sale_id,
         'itemCount', COUNT(*),
         'source', 'individual Drive remittance'
       ),
       inserted.empresa_id
FROM inserted
GROUP BY inserted.sale_id, inserted.empresa_id;

COMMIT;
