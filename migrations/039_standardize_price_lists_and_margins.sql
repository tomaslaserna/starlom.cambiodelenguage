-- Standard price-list assumptions from the Starlim editable pricing sheet.
-- Factors are relative to L2/ANCLA. Because product prices are calculated from
-- cost * multiplier, every rubric keeps its current L2 base and the other lists
-- are recalculated from that base.

BEGIN;

WITH list_map(old_key, target_name, target_order) AS (
  VALUES
    ('lista0', 'L0 - agresivo', 1),
    ('precio0', 'L0 - agresivo', 1),
    ('0', 'L0 - agresivo', 1),
    ('listaexcep', 'L0 - agresivo', 1),
    ('precioexcep', 'L0 - agresivo', 1),
    ('especial', 'L0 - agresivo', 1),
    ('l0agresivo', 'L0 - agresivo', 1),
    ('lista1', 'L1 - suave', 2),
    ('precio1', 'L1 - suave', 2),
    ('precio1yfactura', 'L1 - suave', 2),
    ('mayorista', 'L1 - suave', 2),
    ('1', 'L1 - suave', 2),
    ('l1suave', 'L1 - suave', 2),
    ('lista2', 'L2 - ANCLA', 3),
    ('precio2', 'L2 - ANCLA', 3),
    ('precio2yfactura', 'L2 - ANCLA', 3),
    ('2', 'L2 - ANCLA', 3),
    ('l2ancla', 'L2 - ANCLA', 3),
    ('ancla', 'L2 - ANCLA', 3),
    ('lista3', 'L3 - caro', 4),
    ('precio3', 'L3 - caro', 4),
    ('3', 'L3 - caro', 4),
    ('l3caro', 'L3 - caro', 4),
    ('minorista', 'Minorista', 5),
    ('lista4', 'Minorista', 5),
    ('precio4', 'Minorista', 5),
    ('rev', 'Minorista', 5),
    ('revendedor', 'Minorista', 5),
    ('ver', 'Minorista', 5),
    ('4', 'Minorista', 5)
),
normalized_lists AS (
  SELECT
    lp.id,
    lp.empresa_id,
    lm.target_name,
    lm.target_order
  FROM public.listas_precio lp
  JOIN list_map lm
    ON regexp_replace(lower(coalesce(lp.nombre, '')), '[^a-z0-9]+', '', 'g') = lm.old_key
)
UPDATE public.listas_precio lp
SET nombre = normalized_lists.target_name,
    orden = normalized_lists.target_order,
    activa = 1,
    updated_at = NOW()
FROM normalized_lists
WHERE lp.id = normalized_lists.id;

WITH target_lists(nombre, orden) AS (
  VALUES
    ('L0 - agresivo', 1),
    ('L1 - suave', 2),
    ('L2 - ANCLA', 3),
    ('L3 - caro', 4),
    ('Minorista', 5)
)
INSERT INTO public.listas_precio (nombre, activa, orden, empresa_id)
SELECT target_lists.nombre, 1, target_lists.orden, e.id
FROM public.empresas e
CROSS JOIN target_lists
WHERE NOT EXISTS (
  SELECT 1
  FROM public.listas_precio lp
  WHERE lp.empresa_id = e.id
    AND regexp_replace(lower(coalesce(lp.nombre, '')), '[^a-z0-9]+', '', 'g') =
      regexp_replace(lower(target_lists.nombre), '[^a-z0-9]+', '', 'g')
);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY empresa_id, regexp_replace(lower(coalesce(nombre, '')), '[^a-z0-9]+', '', 'g')
      ORDER BY activa DESC, id ASC
    ) AS rn
  FROM public.listas_precio
  WHERE regexp_replace(lower(coalesce(nombre, '')), '[^a-z0-9]+', '', 'g') IN (
    'l0agresivo',
    'l1suave',
    'l2ancla',
    'l3caro',
    'minorista'
  )
)
UPDATE public.listas_precio lp
SET activa = CASE WHEN ranked.rn = 1 THEN 1 ELSE 0 END,
    updated_at = NOW()
FROM ranked
WHERE lp.id = ranked.id;

UPDATE public.listas_precio lp
SET activa = 0,
    updated_at = NOW()
WHERE regexp_replace(lower(coalesce(lp.nombre, '')), '[^a-z0-9]+', '', 'g') NOT IN (
  'l0agresivo',
  'l1suave',
  'l2ancla',
  'l3caro',
  'minorista'
);

WITH base AS (
  SELECT codigo, empresa_id, COALESCE(NULLIF(precio_2, 0), 1) AS l2_base
  FROM public.margenes
)
UPDATE public.margenes m
SET precio_0 = ROUND(base.l2_base * 0.800, 6),
    precio_1 = ROUND(base.l2_base * 0.900, 6),
    precio_2 = ROUND(base.l2_base, 6),
    precio_3 = ROUND(base.l2_base * 1.150, 6),
    margen_minorista = ROUND(base.l2_base * 1.450, 6),
    updated_at = NOW()
FROM base
WHERE m.codigo = base.codigo
  AND m.empresa_id = base.empresa_id;

WITH active_targets AS (
  SELECT
    lp.id AS lista_id,
    lp.empresa_id,
    regexp_replace(lower(coalesce(lp.nombre, '')), '[^a-z0-9]+', '', 'g') AS list_key
  FROM public.listas_precio lp
  WHERE lp.activa = 1
    AND regexp_replace(lower(coalesce(lp.nombre, '')), '[^a-z0-9]+', '', 'g') IN (
      'l0agresivo',
      'l1suave',
      'l2ancla',
      'l3caro',
      'minorista'
    )
),
target_multipliers AS (
  SELECT
    m.codigo,
    active_targets.lista_id,
    CASE active_targets.list_key
      WHEN 'l0agresivo' THEN m.precio_0
      WHEN 'l1suave' THEN m.precio_1
      WHEN 'l2ancla' THEN m.precio_2
      WHEN 'l3caro' THEN m.precio_3
      WHEN 'minorista' THEN m.margen_minorista
    END AS multiplicador,
    m.empresa_id
  FROM public.margenes m
  JOIN active_targets ON active_targets.empresa_id = m.empresa_id
)
INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT codigo, lista_id, multiplicador, empresa_id
FROM target_multipliers
ON CONFLICT (codigo, lista_id) DO UPDATE
SET multiplicador = EXCLUDED.multiplicador,
    empresa_id = EXCLUDED.empresa_id,
    updated_at = NOW();

WITH normalized_clients AS (
  SELECT
    id,
    empresa_id,
    regexp_replace(lower(coalesce(price_list_name, '')), '[^a-z0-9]+', '', 'g') AS lista_key
  FROM public.clients
)
UPDATE public.clients c
SET price_list_name = CASE
    WHEN normalized_clients.lista_key IN ('precio0', 'lista0', '0', 'listaexcep', 'precioexcep', 'especial', 'l0agresivo') THEN 'L0 - agresivo'
    WHEN normalized_clients.lista_key IN ('precio1', 'precio1yfactura', 'lista1', '1', 'mayorista', 'l1suave') THEN 'L1 - suave'
    WHEN normalized_clients.lista_key IN ('', 'precio2', 'precio2yfactura', 'lista2', '2', 'l2ancla', 'ancla') THEN 'L2 - ANCLA'
    WHEN normalized_clients.lista_key IN ('precio3', 'lista3', '3', 'l3caro') THEN 'L3 - caro'
    WHEN normalized_clients.lista_key IN ('precio4', 'lista4', '4', 'rev', 'revendedor', 'ver', 'minorista') THEN 'Minorista'
    ELSE c.price_list_name
  END,
  updated_at = NOW()
FROM normalized_clients
WHERE c.id = normalized_clients.id
  AND c.empresa_id = normalized_clients.empresa_id
  AND normalized_clients.lista_key IN (
    '',
    'precio0',
    'precio1',
    'precio1yfactura',
    'precio2',
    'precio2yfactura',
    'precio3',
    'precio4',
    'lista0',
    'lista1',
    'lista2',
    'lista3',
    'lista4',
    '0',
    '1',
    '2',
    '3',
    '4',
    'mayorista',
    'minorista',
    'rev',
    'revendedor',
    'ver',
    'listaexcep',
    'precioexcep',
    'especial',
    'l0agresivo',
    'l1suave',
    'l2ancla',
    'l3caro',
    'ancla'
  );

DELETE FROM public.margenes_listas ml
USING public.listas_precio lp
WHERE ml.lista_id = lp.id
  AND ml.empresa_id = lp.empresa_id
  AND lp.activa = 0;

DELETE FROM public.listas_precio
WHERE activa = 0;

COMMIT;
