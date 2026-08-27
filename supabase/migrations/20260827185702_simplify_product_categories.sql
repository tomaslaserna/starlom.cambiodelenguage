-- Consolidate the product catalog into the six operational categories agreed
-- with Starlim. Existing SKUs are retained for traceability.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS legacy_sku text;

ALTER TABLE public.listas_precio
  ADD COLUMN IF NOT EXISTS blocked_until date;

WITH classified AS (
  SELECT p.id,
    CASE
      WHEN upper(p.name) ~ '(PAPEL|PAPELERA|SERVILLETA|TOALLA.*(ROLLO|INTERCAL)|HIGIENIC|BOBINA|RESMA|CARTULINA|ROLLO.*COCINA)' THEN 'PAPELERIA'
      WHEN upper(p.name) ~ '(BALDE|CARRO|GUANTE|ESPONJA|VIRULANA|CABO|ESCOBA|ESCOBILL|CEPILLO|SECADOR|PALA |PLUMERO|REGADERA|DISPENSER|ROCIADOR|PULVERIZADOR|BARREDOR|CONTENEDOR)' THEN 'ARTICULOS'
      WHEN upper(p.name) !~ '(AROMATIZ|DESODOR)' AND upper(p.name) ~ '(TRAPO|REJILLA|PAÑO|PANO|FRANELA|MICROFIBRA|REPASADOR|MOPA|TEXTIL)' THEN 'TEXTIL'
      WHEN upper(coalesce(s.display_name, '')) LIKE '%POLIDES%'
        OR upper(coalesce(p.category, '')) IN ('DESCARTABLES', 'BOLSAS', 'DESCARTABLES VARIOS') THEN 'DESCARTABLES'
      WHEN upper(coalesce(s.display_name, '')) ~ '(MAGNUM|USINA|ESEKAKU)'
        OR upper(p.name) LIKE '%ESEKAKU%' THEN 'MARCA'
      WHEN upper(coalesce(p.category, '')) = 'PAPEL' THEN 'PAPELERIA'
      WHEN upper(coalesce(p.category, '')) = 'NIDAL MODULAR' THEN 'ARTICULOS'
      ELSE 'LIMPIEZA'
    END AS category
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
  WHERE p.empresa_id = 1
), category_data(code, name, base_margin) AS (
  VALUES
    ('DES', 'DESCARTABLES', 1.44::numeric),
    ('PAP', 'PAPELERIA', 1.53::numeric),
    ('LIM', 'LIMPIEZA', 1.53::numeric),
    ('ART', 'ARTICULOS', 1.53::numeric),
    ('TEX', 'TEXTIL', 1.53::numeric),
    ('MAR', 'MARCA', 1.17::numeric)
)
INSERT INTO public.margenes (
  codigo, nombre, precio_0, precio_1, precio_2, precio_3, margen_minorista, empresa_id
)
SELECT code, name, base_margin * 0.888888889, base_margin,
       base_margin * 1.111111111, base_margin * 1.277777778,
       base_margin * 1.611111111, 1
FROM category_data
ON CONFLICT (codigo) DO UPDATE SET
  nombre = excluded.nombre,
  precio_0 = excluded.precio_0,
  precio_1 = excluded.precio_1,
  precio_2 = excluded.precio_2,
  precio_3 = excluded.precio_3,
  margen_minorista = excluded.margen_minorista,
  updated_at = now();

WITH classified AS (
  SELECT p.id,
    CASE
      WHEN upper(p.name) ~ '(PAPEL|PAPELERA|SERVILLETA|TOALLA.*(ROLLO|INTERCAL)|HIGIENIC|BOBINA|RESMA|CARTULINA|ROLLO.*COCINA)' THEN 'PAPELERIA'
      WHEN upper(p.name) ~ '(BALDE|CARRO|GUANTE|ESPONJA|VIRULANA|CABO|ESCOBA|ESCOBILL|CEPILLO|SECADOR|PALA |PLUMERO|REGADERA|DISPENSER|ROCIADOR|PULVERIZADOR|BARREDOR|CONTENEDOR)' THEN 'ARTICULOS'
      WHEN upper(p.name) !~ '(AROMATIZ|DESODOR)' AND upper(p.name) ~ '(TRAPO|REJILLA|PAÑO|PANO|FRANELA|MICROFIBRA|REPASADOR|MOPA|TEXTIL)' THEN 'TEXTIL'
      WHEN upper(coalesce(s.display_name, '')) LIKE '%POLIDES%'
        OR upper(coalesce(p.category, '')) IN ('DESCARTABLES', 'BOLSAS', 'DESCARTABLES VARIOS') THEN 'DESCARTABLES'
      WHEN upper(coalesce(s.display_name, '')) ~ '(MAGNUM|USINA|ESEKAKU)'
        OR upper(p.name) LIKE '%ESEKAKU%' THEN 'MARCA'
      WHEN upper(coalesce(p.category, '')) = 'PAPEL' THEN 'PAPELERIA'
      WHEN upper(coalesce(p.category, '')) = 'NIDAL MODULAR' THEN 'ARTICULOS'
      ELSE 'LIMPIEZA'
    END AS category
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
  WHERE p.empresa_id = 1
), numbered AS (
  SELECT c.id, c.category,
         CASE c.category WHEN 'DESCARTABLES' THEN 'DES' WHEN 'PAPELERIA' THEN 'PAP'
           WHEN 'LIMPIEZA' THEN 'LIM' WHEN 'ARTICULOS' THEN 'ART'
           WHEN 'TEXTIL' THEN 'TEX' ELSE 'MAR' END AS code,
         row_number() OVER (PARTITION BY c.category ORDER BY p.created_at, p.id) AS sequence
  FROM classified c JOIN public.products p ON p.id = c.id
)
UPDATE public.products p
SET legacy_sku = coalesce(p.legacy_sku, p.sku),
    category = n.category,
    category_code = n.code,
    sku = n.code || '-' || lpad(n.sequence::text, 5, '0'),
    updated_at = now()
FROM numbered n
WHERE p.id = n.id;

-- Replace obsolete pricing categories only after every product was reassigned.
DELETE FROM public.margenes_listas
WHERE empresa_id = 1 AND codigo NOT IN ('DES', 'PAP', 'LIM', 'ART', 'TEX', 'MAR');
DELETE FROM public.margenes
WHERE empresa_id = 1 AND codigo NOT IN ('DES', 'PAP', 'LIM', 'ART', 'TEX', 'MAR');

INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT m.codigo, lp.id,
       round((m.precio_1 * (1 + lp.percentage / 100.0))::numeric, 6), 1
FROM public.margenes m
JOIN public.listas_precio lp ON lp.empresa_id = m.empresa_id
WHERE m.empresa_id = 1
ON CONFLICT (codigo, lista_id) DO UPDATE SET
  multiplicador = excluded.multiplicador,
  empresa_id = excluded.empresa_id,
  updated_at = now();

COMMENT ON COLUMN public.products.legacy_sku IS
  'SKU used before automatic category-based SKU assignment.';
