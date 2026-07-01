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
SUPABASE_DB_USER=
SUPABASE_DB_PASS=

# Alternativa: si DATABASE_URL esta definido, tiene prioridad sobre SUPABASE_DB_*.
DATABASE_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

STARLIM_SESSION_SECRET=
STARLIM_PEPPER=

STARLIM_STORAGE_BUCKET=uploads
STARLIM_FISCAL_PROVIDER=disabled
STARLIM_FISCAL_MODE=testing
```

Usar `DATABASE_URL` o el bloque `SUPABASE_DB_*`, no ambos salvo que se entienda
que `DATABASE_URL` tiene prioridad.

## Datos que hay que pedir por canal seguro

Pedir al responsable del proyecto:

- host, puerto, usuario y password de Postgres, o `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STARLIM_SESSION_SECRET`
- `STARLIM_PEPPER`, si aplica
- email y contrasena de un usuario valido de Supabase Auth

No mandar estos datos por commits, issues, PRs, chats publicos ni capturas.

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

