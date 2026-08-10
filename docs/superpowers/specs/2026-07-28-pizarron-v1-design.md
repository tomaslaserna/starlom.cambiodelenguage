# Pizarrón v1 (privado por usuario)

**Fecha:** 2026-07-28
**Estado:** aprobado (diseño)

## Objetivo

Una pestaña **Pizarrón** en el Inicio: un tablero libre y privado por usuario
donde pegar post-its para las tareas, moverlos libremente, clasificarlos por
color y **mencionar compañeros con `@` inline** para avisarles. Las flechas entre
notas quedan para la Fase 2.

## Ubicación

Nueva pestaña "Pizarrón" en `InicioTabs` (junto a Para vos / Delegadas /
Mensajes). Contenido = tablero alto (~70vh), pannable, con fondo cuadriculado.

## Modelo (privado por usuario)

- Cada usuario ve y edita **solo su** tablero (`owner_username = session.username`).
- Post-it: `text`, `color`, posición `x`/`y`.
- Menciones: derivadas del texto (tokens `@usuario`) validadas contra los
  compañeros de la empresa; al mencionar a alguien nuevo se le envía un aviso.

## Datos (migración)

```
board_notes (
  id UUID PK DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  owner_username TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'amarillo',
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
board_note_mentions (
  id BIGSERIAL PK,
  note_id UUID NOT NULL REFERENCES board_notes(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  mentioned_username TEXT NOT NULL
)
```

RLS por `empresa_id` (patrón `starlim_app`); índices por `(empresa_id,
owner_username)` y `(empresa_id, note_id)`.

## Lógica pura (`lib/board-mentions.ts`, testeable)

- `parseMentions(text, validUsernames)` → lista (sin duplicados) de usernames
  válidos mencionados con `@` en el texto. Case-insensitive, respeta límites de
  palabra. Es la fuente de verdad de las menciones (para persistir y avisar).

## Servidor (`lib/board.ts`)

- `listBoardNotes(session)` → notas del owner con sus menciones.
- `createBoardNote(session, { x, y })` → nota vacía (color por defecto).
- `updateBoardNote(session, id, { text?, color?, x?, y? })` → actualiza; si cambió
  el texto, recalcula menciones (`parseMentions` contra compañeros), reemplaza
  `board_note_mentions` y **avisa a los recién mencionados** (mensaje interno vía
  `mensajes`, sin duplicar avisos ya enviados en esta edición).
- `deleteBoardNote(session, id)`.
- Compañeros válidos: usernames de staff de la empresa (los mismos que
  `listMessageCenter().employees`).

## API

- `POST /api/board/notes` → crea (body `{x,y}`) → devuelve la nota.
- `PATCH /api/board/notes/[id]` → actualiza posición/texto/color (body parcial).
- `DELETE /api/board/notes/[id]` → borra.
- Todas con `requireApiSession`; operan solo sobre notas del propio usuario.

## Cliente (`app/pizarron-board.tsx`)

- Viewport ~70vh con fondo cuadriculado y **pan** arrastrando el fondo (+ scroll).
- Post-its absolutos en (x,y); **arrastre** con pointer events; al soltar → PATCH.
- Crear (＋), editar texto (textarea), **paleta de 5 colores**, borrar.
- **@ inline**: al tipear `@` aparece un desplegable de compañeros filtrado; al
  elegir, inserta `@usuario`. Al guardar (blur/soltar) se persisten texto y
  menciones. Los `@usuario` se resaltan como chips en la nota.
- Guardado optimista con debounce; como sos el único editor de tu tablero, no hay
  conflicto de concurrencia.

## Testing

- **Unitario (`node --test`)**: `parseMentions` (uno, varios, duplicados,
  case-insensitive, ignora @desconocido, límites de palabra).
- **DB smoke test**: crear nota, actualizar texto con `@` → verifica menciones
  persistidas; borrar; rollback.
- **Build**: `next build`.

## Fuera de v1 (Fase 2)

Flechas/conectores entre notas, ver/colaborar en el tablero de otro usuario,
tiempo real, redimensionar/fijar post-its.
