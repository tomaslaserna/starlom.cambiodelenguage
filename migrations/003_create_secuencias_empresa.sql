-- Contadores atomicos por empresa.

CREATE TABLE IF NOT EXISTS public.secuencias_empresa (
    empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tipo VARCHAR(80) NOT NULL,
    valor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id, tipo)
);

COMMENT ON TABLE public.secuencias_empresa IS
    'Contadores atomicos por empresa y tipo documental.';

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.current_empresa_id(p_default BIGINT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_raw TEXT;
BEGIN
    v_raw := current_setting('app.current_empresa_id', true);
    IF v_raw IS NOT NULL AND v_raw ~ '^[0-9]+$' THEN
        RETURN v_raw::BIGINT;
    END IF;
    RETURN p_default;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.next_sequence(p_empresa_id BIGINT, p_tipo TEXT)
RETURNS BIGINT
LANGUAGE sql
VOLATILE
AS $$
    INSERT INTO public.secuencias_empresa (empresa_id, tipo, valor, updated_at)
    VALUES (p_empresa_id, p_tipo, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (empresa_id, tipo)
    DO UPDATE SET
        valor = public.secuencias_empresa.valor + 1,
        updated_at = CURRENT_TIMESTAMP
    RETURNING valor;
$$;
