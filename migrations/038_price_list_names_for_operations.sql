ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS price_list_name TEXT NOT NULL DEFAULT '';

WITH target_lists(nombre, orden) AS (
  VALUES
    ('LISTA EXCEP', 1),
    ('LISTA 0', 2),
    ('LISTA 1', 3),
    ('LISTA 2', 4),
    ('LISTA 3', 5),
    ('MAYORISTA', 6),
    ('MINORISTA', 7)
)
INSERT INTO public.listas_precio (nombre, activa, orden, empresa_id)
SELECT target_lists.nombre, 1, target_lists.orden, e.id
FROM public.empresas e
CROSS JOIN target_lists
WHERE NOT EXISTS (
  SELECT 1
  FROM public.listas_precio lp
  WHERE lp.empresa_id = e.id
    AND lower(lp.nombre) = lower(target_lists.nombre)
);

INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT
  m.codigo,
  lp.id,
  CASE
    WHEN upper(lp.nombre) = 'LISTA 0' THEN m.precio_0
    WHEN upper(lp.nombre) = 'LISTA 1' THEN m.precio_1
    WHEN upper(lp.nombre) = 'LISTA 2' THEN m.precio_2
    WHEN upper(lp.nombre) = 'LISTA 3' THEN m.precio_3
    WHEN upper(lp.nombre) = 'MINORISTA' THEN m.margen_minorista
    WHEN upper(lp.nombre) = 'MAYORISTA' THEN m.precio_1
    WHEN upper(lp.nombre) = 'LISTA EXCEP' THEN GREATEST(1, m.precio_0 * 0.875)
    ELSE m.precio_1
  END,
  m.empresa_id
FROM public.margenes m
JOIN public.listas_precio lp
  ON lp.empresa_id = m.empresa_id
 AND lp.activa = 1
 AND upper(lp.nombre) IN ('LISTA EXCEP', 'LISTA 0', 'LISTA 1', 'LISTA 2', 'LISTA 3', 'MAYORISTA', 'MINORISTA')
ON CONFLICT (codigo, lista_id) DO NOTHING;

UPDATE public.listas_precio lp
SET activa = 0,
    updated_at = NOW()
WHERE lower(lp.nombre) = 'general'
  AND EXISTS (
    SELECT 1
    FROM public.listas_precio active_list
    WHERE active_list.empresa_id = lp.empresa_id
      AND active_list.activa = 1
      AND upper(active_list.nombre) IN (
        'LISTA EXCEP',
        'LISTA 0',
        'LISTA 1',
        'LISTA 2',
        'LISTA 3',
        'MAYORISTA',
        'MINORISTA'
      )
  );

DROP TABLE IF EXISTS tmp_drive_price_multipliers;

CREATE TEMP TABLE tmp_drive_price_multipliers (
  codigo TEXT NOT NULL,
  lista_nombre TEXT NOT NULL,
  multiplicador NUMERIC NOT NULL
);

INSERT INTO tmp_drive_price_multipliers (codigo, lista_nombre, multiplicador)
VALUES
    ('11', 'LISTA EXCEP', 1.111111),
    ('11', 'LISTA 0', 1.28),
    ('11', 'LISTA 1', 1.44),
    ('11', 'LISTA 2', 1.6),
    ('11', 'LISTA 3', 1.84),
    ('11', 'MINORISTA', 2.320087),
    ('11', 'MAYORISTA', 1.44),
    ('111', 'LISTA EXCEP', 1.111111),
    ('111', 'LISTA 0', 1.28),
    ('111', 'LISTA 1', 1.44),
    ('111', 'LISTA 2', 1.6),
    ('111', 'LISTA 3', 1.84),
    ('111', 'MINORISTA', 2.32033),
    ('111', 'MAYORISTA', 1.44),
    ('112', 'LISTA EXCEP', 1.111111),
    ('112', 'LISTA 0', 1.28),
    ('112', 'LISTA 1', 1.44),
    ('112', 'LISTA 2', 1.6),
    ('112', 'LISTA 3', 1.84),
    ('112', 'MINORISTA', 2.318613),
    ('112', 'MAYORISTA', 1.44),
    ('113', 'LISTA EXCEP', 1.111111),
    ('113', 'LISTA 0', 1.28),
    ('113', 'LISTA 1', 1.44),
    ('113', 'LISTA 2', 1.6),
    ('113', 'LISTA 3', 1.84),
    ('113', 'MINORISTA', 2.321476),
    ('113', 'MAYORISTA', 1.44),
    ('114', 'LISTA EXCEP', 1.111111),
    ('114', 'LISTA 0', 1.28),
    ('114', 'LISTA 1', 1.44),
    ('114', 'LISTA 2', 1.6),
    ('114', 'LISTA 3', 1.84),
    ('114', 'MINORISTA', 2.314211),
    ('114', 'MAYORISTA', 1.44),
    ('115', 'LISTA EXCEP', 1.111111),
    ('115', 'LISTA 0', 1.28),
    ('115', 'LISTA 1', 1.44),
    ('115', 'LISTA 2', 1.6),
    ('115', 'LISTA 3', 1.84),
    ('115', 'MINORISTA', 2.318043),
    ('115', 'MAYORISTA', 1.44),
    ('116', 'LISTA EXCEP', 1.111111),
    ('116', 'LISTA 0', 1.28),
    ('116', 'LISTA 1', 1.44),
    ('116', 'LISTA 2', 1.6),
    ('116', 'LISTA 3', 1.84),
    ('116', 'MINORISTA', 2.320157),
    ('116', 'MAYORISTA', 1.44),
    ('117', 'LISTA EXCEP', 1.111111),
    ('117', 'LISTA 0', 1.28),
    ('117', 'LISTA 1', 1.44),
    ('117', 'LISTA 2', 1.6),
    ('117', 'LISTA 3', 1.84),
    ('117', 'MINORISTA', 2.316565),
    ('117', 'MAYORISTA', 1.44),
    ('118', 'LISTA EXCEP', 1.111111),
    ('118', 'LISTA 0', 1.28),
    ('118', 'LISTA 1', 1.44),
    ('118', 'LISTA 2', 1.6),
    ('118', 'LISTA 3', 1.84),
    ('118', 'MINORISTA', 2.324858),
    ('118', 'MAYORISTA', 1.44),
    ('12', 'LISTA EXCEP', 1.111111),
    ('12', 'LISTA 0', 1.28),
    ('12', 'LISTA 1', 1.44),
    ('12', 'LISTA 2', 1.6),
    ('12', 'LISTA 3', 1.84),
    ('12', 'MINORISTA', 2.320223),
    ('12', 'MAYORISTA', 1.44),
    ('13', 'LISTA EXCEP', 1.111111),
    ('13', 'LISTA 0', 1.28),
    ('13', 'LISTA 1', 1.44),
    ('13', 'LISTA 2', 1.6),
    ('13', 'LISTA 3', 1.84),
    ('13', 'MINORISTA', 2.323964),
    ('13', 'MAYORISTA', 1.44),
    ('14', 'LISTA EXCEP', 1.111111),
    ('14', 'LISTA 0', 1.28),
    ('14', 'LISTA 1', 1.44),
    ('14', 'LISTA 2', 1.6),
    ('14', 'LISTA 3', 1.84),
    ('14', 'MINORISTA', 2.320072),
    ('14', 'MAYORISTA', 1.44),
    ('15', 'LISTA EXCEP', 1.111111),
    ('15', 'LISTA 0', 1.28),
    ('15', 'LISTA 1', 1.44),
    ('15', 'LISTA 2', 1.6),
    ('15', 'LISTA 3', 1.84),
    ('15', 'MINORISTA', 2.320667),
    ('15', 'MAYORISTA', 1.44),
    ('16', 'LISTA EXCEP', 1.111111),
    ('16', 'LISTA 0', 1.28),
    ('16', 'LISTA 1', 1.44),
    ('16', 'LISTA 2', 1.6),
    ('16', 'LISTA 3', 1.84),
    ('16', 'MINORISTA', 2.321809),
    ('16', 'MAYORISTA', 1.44),
    ('17', 'LISTA EXCEP', 1.111111),
    ('17', 'LISTA 0', 1.28),
    ('17', 'LISTA 1', 1.44),
    ('17', 'LISTA 2', 1.6),
    ('17', 'LISTA 3', 1.84),
    ('17', 'MINORISTA', 2.322216),
    ('17', 'MAYORISTA', 1.44),
    ('18', 'LISTA EXCEP', 1.111111),
    ('18', 'LISTA 0', 1.28),
    ('18', 'LISTA 1', 1.44),
    ('18', 'LISTA 2', 1.6),
    ('18', 'LISTA 3', 1.84),
    ('18', 'MINORISTA', 2.32061),
    ('18', 'MAYORISTA', 1.44),
    ('19', 'LISTA EXCEP', 1.111111),
    ('19', 'LISTA 0', 1.28),
    ('19', 'LISTA 1', 1.44),
    ('19', 'LISTA 2', 1.6),
    ('19', 'LISTA 3', 1.84),
    ('19', 'MINORISTA', 2.322748),
    ('19', 'MAYORISTA', 1.44),
    ('21', 'LISTA EXCEP', 1.111111),
    ('21', 'LISTA 0', 1.28),
    ('21', 'LISTA 1', 1.44),
    ('21', 'LISTA 2', 1.6),
    ('21', 'LISTA 3', 1.84),
    ('21', 'MINORISTA', 2.319267),
    ('21', 'MAYORISTA', 1.44),
    ('22', 'LISTA EXCEP', 1.111111),
    ('22', 'LISTA 0', 1.28),
    ('22', 'LISTA 1', 1.44),
    ('22', 'LISTA 2', 1.6),
    ('22', 'LISTA 3', 1.84),
    ('22', 'MINORISTA', 2.318398),
    ('22', 'MAYORISTA', 1.44),
    ('23', 'LISTA EXCEP', 1.111111),
    ('23', 'LISTA 0', 1.28),
    ('23', 'LISTA 1', 1.44),
    ('23', 'LISTA 2', 1.6),
    ('23', 'LISTA 3', 1.84),
    ('23', 'MINORISTA', 2.325968),
    ('23', 'MAYORISTA', 1.44),
    ('24', 'LISTA EXCEP', 1.111111),
    ('24', 'LISTA 0', 1.28),
    ('24', 'LISTA 1', 1.44),
    ('24', 'LISTA 2', 1.6),
    ('24', 'LISTA 3', 1.84),
    ('24', 'MINORISTA', 2.320644),
    ('24', 'MAYORISTA', 1.44),
    ('25', 'LISTA EXCEP', 1.111111),
    ('25', 'LISTA 0', 1.28),
    ('25', 'LISTA 1', 1.44),
    ('25', 'LISTA 2', 1.6),
    ('25', 'LISTA 3', 1.84),
    ('25', 'MINORISTA', 2.321784),
    ('25', 'MAYORISTA', 1.44),
    ('26', 'LISTA EXCEP', 1.111111),
    ('26', 'LISTA 0', 1.28),
    ('26', 'LISTA 1', 1.44),
    ('26', 'LISTA 2', 1.6),
    ('26', 'LISTA 3', 1.84),
    ('26', 'MINORISTA', 2.320107),
    ('26', 'MAYORISTA', 1.44),
    ('27', 'LISTA EXCEP', 1.111111),
    ('27', 'LISTA 0', 1.28),
    ('27', 'LISTA 1', 1.44),
    ('27', 'LISTA 2', 1.6),
    ('27', 'LISTA 3', 1.84),
    ('27', 'MINORISTA', 2.320403),
    ('27', 'MAYORISTA', 1.44),
    ('28', 'LISTA EXCEP', 1.111111),
    ('28', 'LISTA 0', 1.28),
    ('28', 'LISTA 1', 1.44),
    ('28', 'LISTA 2', 1.6),
    ('28', 'LISTA 3', 1.84),
    ('28', 'MINORISTA', 2.319908),
    ('28', 'MAYORISTA', 1.44),
    ('30', 'LISTA EXCEP', 1.111111),
    ('30', 'LISTA 0', 1.28),
    ('30', 'LISTA 1', 1.44),
    ('30', 'LISTA 2', 1.6),
    ('30', 'LISTA 3', 1.84),
    ('30', 'MINORISTA', 2.316859),
    ('30', 'MAYORISTA', 1.44),
    ('418', 'LISTA EXCEP', 1.111111),
    ('418', 'LISTA 0', 1.25),
    ('418', 'LISTA 1', 1.35),
    ('418', 'LISTA 2', 1.5),
    ('418', 'LISTA 3', 1.725),
    ('418', 'MINORISTA', 2.158288),
    ('418', 'MAYORISTA', 1.35),
    ('425', 'LISTA EXCEP', 1.111111),
    ('425', 'LISTA 0', 1.25),
    ('425', 'LISTA 1', 1.35),
    ('425', 'LISTA 2', 1.5),
    ('425', 'LISTA 3', 1.725),
    ('425', 'MINORISTA', 2.17558),
    ('425', 'MAYORISTA', 1.35),
    ('428', 'LISTA EXCEP', 1.111111),
    ('428', 'LISTA 0', 1.25),
    ('428', 'LISTA 1', 1.35),
    ('428', 'LISTA 2', 1.5),
    ('428', 'LISTA 3', 1.725),
    ('428', 'MINORISTA', 2.174861),
    ('428', 'MAYORISTA', 1.35),
    ('50', 'LISTA EXCEP', 1.111111),
    ('50', 'LISTA 0', 1.2),
    ('50', 'LISTA 1', 1.2),
    ('50', 'LISTA 2', 1.2),
    ('50', 'LISTA 3', 1.38),
    ('50', 'MINORISTA', 1.739903),
    ('50', 'MAYORISTA', 1.2),
    ('71', 'LISTA EXCEP', 1.111111),
    ('71', 'LISTA 0', 1.25),
    ('71', 'LISTA 1', 1.25),
    ('71', 'LISTA 2', 1.35),
    ('71', 'LISTA 3', 1.5525),
    ('71', 'MINORISTA', 1.957501),
    ('71', 'MAYORISTA', 1.25);

WITH pivot AS (
  SELECT
    codigo,
    MAX(multiplicador) FILTER (WHERE lista_nombre = 'LISTA 0') AS precio_0,
    MAX(multiplicador) FILTER (WHERE lista_nombre = 'LISTA 1') AS precio_1,
    MAX(multiplicador) FILTER (WHERE lista_nombre = 'LISTA 2') AS precio_2,
    MAX(multiplicador) FILTER (WHERE lista_nombre = 'LISTA 3') AS precio_3,
    MAX(multiplicador) FILTER (WHERE lista_nombre = 'MINORISTA') AS margen_minorista
  FROM tmp_drive_price_multipliers
  GROUP BY codigo
)
UPDATE public.margenes m
SET precio_0 = COALESCE(pivot.precio_0, m.precio_0),
    precio_1 = COALESCE(pivot.precio_1, m.precio_1),
    precio_2 = COALESCE(pivot.precio_2, m.precio_2),
    precio_3 = COALESCE(pivot.precio_3, m.precio_3),
    margen_minorista = COALESCE(pivot.margen_minorista, m.margen_minorista),
    updated_at = NOW()
FROM pivot
WHERE m.codigo = pivot.codigo;

INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT
  dm.codigo,
  lp.id,
  dm.multiplicador,
  m.empresa_id
FROM tmp_drive_price_multipliers dm
JOIN public.margenes m
  ON m.codigo = dm.codigo
JOIN public.listas_precio lp
  ON lp.empresa_id = m.empresa_id
 AND lp.activa = 1
 AND lower(lp.nombre) = lower(dm.lista_nombre)
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
    WHEN normalized_clients.lista_key IN ('', 'precio1', 'precio1yfactura', 'lista1', '1') THEN 'LISTA 1'
    WHEN normalized_clients.lista_key IN ('precio0', 'lista0', '0') THEN 'LISTA 0'
    WHEN normalized_clients.lista_key IN ('precio2', 'lista2', '2') THEN 'LISTA 2'
    WHEN normalized_clients.lista_key IN ('precio3', 'lista3', '3') THEN 'LISTA 3'
    WHEN normalized_clients.lista_key IN ('precio4', 'lista4', '4', 'rev', 'revendedor', 'minorista') THEN 'MINORISTA'
    WHEN normalized_clients.lista_key = 'mayorista' THEN 'MAYORISTA'
    WHEN normalized_clients.lista_key IN ('listaexcep', 'precioexcep', 'especial') THEN 'LISTA EXCEP'
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
    'rev',
    'revendedor',
    'minorista',
    'mayorista',
    'listaexcep',
    'precioexcep',
    'especial'
  );

DROP TABLE IF EXISTS tmp_drive_price_multipliers;
