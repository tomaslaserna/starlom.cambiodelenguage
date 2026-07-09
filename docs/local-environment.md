# Configuracion local de entorno

Este proyecto no sube credenciales reales a Git. Cada maquina debe tener su
propio `apps/web/.env.local`, creado a partir de `apps/web/.env.example`.

## Por que no esta en Git

`apps/web/.env*.local` esta ignorado por `.gitignore` porque contiene secretos:

- password de Postgres
- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- secretos de sesion
- certificados o claves fiscales

No commitear esos valores. La `SUPABASE_SERVICE_ROLE_KEY` permite operaciones
administrativas y puede saltear protecciones de RLS si se usa mal.

## Variables requeridas

Para apuntar a la base Supabase nueva, cargar en `apps/web/.env.local`:

```env
SUPABASE_DB_HOST=
SUPABASE_DB_PORT=6543
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=starlim_app
SUPABASE_DB_PASS=
SUPABASE_DB_SSL_REJECT_UNAUTHORIZED=true

# Alternativa: si DATABASE_URL esta definido, tiene prioridad sobre SUPABASE_DB_*.
DATABASE_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

STARLIM_SESSION_SECRET=
STARLIM_PEPPER=

STARLIM_STORAGE_BUCKET=uploads
STARLIM_ALLOWED_ORIGINS=
STARLIM_FISCAL_PROVIDER=disabled
STARLIM_FISCAL_MODE=testing
STARLIM_ARCA_CUIT=
STARLIM_ARCA_POINT_OF_SALE=
STARLIM_ARCA_CERT_PATH=
STARLIM_ARCA_KEY_PATH=
STARLIM_ARCA_CERT_BASE64=
STARLIM_ARCA_KEY_BASE64=
```

Usar `DATABASE_URL` o el bloque `SUPABASE_DB_*`, no ambos salvo que se entienda
que `DATABASE_URL` tiene prioridad.

## Rol runtime de Postgres

La app no debe conectarse como `postgres`, `anon`, `authenticated` ni
`service_role`. Despues de aplicar las migraciones, crear la contrasena del rol
fuera de Git:

```sql
ALTER ROLE starlim_app WITH PASSWORD '<password-entregado-por-canal-seguro>';
```

Luego usar `SUPABASE_DB_USER=starlim_app` y esa contrasena en local/Vercel. Si
el pooler de Supabase exige usuario calificado, usar
`starlim_app.<project-ref>` como usuario del pooler. El rol queda con
`NOBYPASSRLS`, limites de timeout y permisos acotados al runtime.

## Seguridad local vs produccion

- Mantener `SUPABASE_DB_SSL_REJECT_UNAUTHORIZED=true` o vacio en produccion.
  Usar `false` solo como diagnostico local si una CA corporativa rompe TLS.
- `STARLIM_ALLOWED_ORIGINS` solo debe listar dominios propios adicionales,
  separados por coma y sin comodines. En produccion deben ser `https://`.
- El bucket `STARLIM_STORAGE_BUCKET` debe ser privado. La app guarda referencias
  internas y sirve archivos por URL firmada desde rutas autenticadas.
- La app rechaza cuerpos JSON/form grandes por defecto. Los CSV y comprobantes
  tienen limites especificos para evitar abuso de memoria.

## Datos que hay que pedir por canal seguro

Pedir al responsable del proyecto:

- host, puerto, usuario y password de Postgres, o `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STARLIM_SESSION_SECRET`
- `STARLIM_PEPPER`, si aplica
- credenciales ARCA: CUIT, punto de venta, certificado y clave privada
- email y contrasena de un usuario valido de Supabase Auth

No mandar estos datos por commits, issues, PRs, chats publicos ni capturas.

Para desarrollo local, ARCA puede usar `STARLIM_ARCA_CERT_PATH` y
`STARLIM_ARCA_KEY_PATH`. Para Vercel, usar `STARLIM_ARCA_CERT_BASE64` y
`STARLIM_ARCA_KEY_BASE64`, o las variantes `*_PEM`, porque los paths locales no
existen dentro de las funciones serverless.

## Setup rapido

```bash
cd apps/web
copy .env.example .env.local
npm install
npm run dev
```

Despues editar `apps/web/.env.local` con los valores reales.

## Verificacion

Con el dev server corriendo:

```text
http://localhost:3000/api/health
```

Debe responder `ok: true` y mostrar la fuente de DB esperada.

Luego probar:

- login con usuario de Supabase Auth
- `/`
- `/orders`
- `/products`
- `/customers`
- `/purchases`
- `/metrics`

Si el login falla aunque la DB conecte, revisar que el usuario exista en
Supabase Auth y tambien este vinculado en `profiles` y `usuario_empresa`.

## Senales de que apunta a la base vieja

- la URL o host contiene el project ref viejo
- faltan tablas como `profiles`, `clients`, `sales`, `products`
- aparecen errores por tablas legacy en castellano o por esquema no alineado

