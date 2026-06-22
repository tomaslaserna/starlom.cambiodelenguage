-- Relacion usuario global -> empresa.
-- El login actual mantiene usuarios.usuario/correo globales.

CREATE TABLE IF NOT EXISTS public.usuario_empresa (
    id_usuario INT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    rango VARCHAR(50) NOT NULL DEFAULT 'Minorista',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_empresa_empresa
    ON public.usuario_empresa (empresa_id);

COMMENT ON TABLE public.usuario_empresa IS
    'Relacion entre usuario global y empresas asignadas, con rango por empresa.';
