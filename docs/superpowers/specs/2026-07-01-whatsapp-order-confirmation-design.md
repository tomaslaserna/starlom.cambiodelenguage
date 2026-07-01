# Generador de confirmación para WhatsApp — Diseño

Fecha: 2026-07-01
Módulo: Comercial › Pedidos › Cargar pedido (`/orders/new`)

## Objetivo

Que el comercial transforme el pedido que va cargando en un mensaje de
confirmación formateado, listo para copiar o abrir directo en WhatsApp con el
cliente. Reemplaza el armado manual del mensaje en el celular.

## Alcance (v1)

- Vista previa **en vivo** del mensaje dentro de la pantalla "Cargar pedido",
  generada solo con lo que el comercial va cargando (cliente + líneas + fecha).
- Botón **Copiar** y botón **Abrir en WhatsApp** (`wa.me`).
- Campo opcional **Oferta**: si se completa, agrega la línea 💡; si está vacío,
  no aparece.
- **Sin cambios de base de datos.** Todo se arma en el momento, no se persiste.

Fuera de alcance (features futuros, no acá):
- Módulo de Ofertas atado al punto de equilibrio (la línea de oferta es manual
  por ahora).
- Guardar/auditar el texto enviado.

## Arquitectura

### Unidad aislada: la lógica de formato

`src/lib/order-confirmation.ts` — función pura, sin React ni DB:

```ts
type ConfirmationLine = { quantity: number; name: string };

type ConfirmationInput = {
  businessName: string;        // client.name (razón social + zona)
  lines: ConfirmationLine[];   // solo líneas con producto y cantidad > 0
  deliveryLocation: string;    // client.address
  deliveryDate: string;        // YYYY-MM-DD (del campo del formulario)
  offerText?: string;          // opcional, del campo Oferta
};

buildWhatsappConfirmation(input: ConfirmationInput): string
```

Helper de teléfono también en este módulo (o en `lib/format.ts` si encaja):

```ts
normalizePhoneForWhatsapp(phone: string): string | null
// saca todo lo no-numérico; si no arranca con 54, antepone 54 (Argentina);
// devuelve null si no queda un número usable
```

### UI

Nuevo componente cliente `OrderConfirmationPreview` (en
`src/app/orders/new/`), consumido por `OrderEntryFields`:

- Recibe por props: `businessName`, `phone`, `address`, `lines` (cant + nombre),
  `deliveryDate`, y maneja su propio estado del campo `offerText`.
- Muestra el texto de `buildWhatsappConfirmation(...)` en un `<pre>`/panel que se
  actualiza en vivo.
- Botón **Copiar** → `navigator.clipboard.writeText(text)` con feedback
  ("Copiado ✓").
- Botón **Abrir en WhatsApp** → link `https://wa.me/<tel>?text=<encodeURIComponent(text)>`.
  Si el teléfono no es válido (`normalizePhoneForWhatsapp` → null), el botón
  queda deshabilitado con tooltip "Sin teléfono válido".

`OrderEntryFields` ya tiene en estado el cliente seleccionado, las líneas
(`calculatedLines` con `product.name` y `quantity`) y la fecha → se los pasa al
preview. Se agrega el objeto cliente los campos `phone` y `address` (ya existen
en `OrderFormClient`).

### Cambio menor en el formulario

El campo "Fecha" existente se reutiliza como **fecha de entrega estimada** y se
renombra su label a "Fecha de entrega". No cambia el `name` del input ni la
lógica de guardado del pedido.

## Formato del mensaje (WhatsApp nativo)

Negrita con **un** asterisco (`*texto*`), que es lo que WhatsApp renderiza.

```
*CONFIRMACIÓN DE TU PEDIDO – STARLIM* ✅

*{businessName}*, te confirmamos antes de preparar:

*Pedido:*
• {cant} x {nombre}
• {cant} x {nombre}
...

🚚 *Entrega:* {deliveryLocation}
📅 *Entrega estimada:* {DD.MM.YY} ({DíaSemana})

¿Está todo correcto? Respondé *SÍ* para confirmar, o decinos qué corregir.

💡 {offerText}        ← solo si offerText no está vacío
```

Detalles de formato:
- Fecha: `DD.MM.YY` + día de la semana en español capitalizado (Lunes..Domingo),
  derivado de `deliveryDate`. Ej: `30.06.26 (Martes)`.
- Cantidad: entera si es entera (`1`, `3`), sino con decimales mínimos.
- Comportamiento sin datos suficientes (definido, no ambiguo): los botones
  **Copiar** y **Abrir en WhatsApp** se habilitan solo cuando hay cliente
  seleccionado **y** al menos 1 línea con cantidad > 0. Si falta alguno, el panel
  muestra un texto guía ("Seleccioná un cliente y agregá productos para ver la
  confirmación") en lugar del mensaje.

## Manejo de errores / bordes

- Sin cliente seleccionado → el preview muestra un placeholder ("Seleccioná un
  cliente para armar la confirmación"); botones deshabilitados.
- Cliente sin teléfono → botón WhatsApp deshabilitado, Copiar sigue disponible.
- Cliente sin dirección → la línea 🚚 Entrega muestra vacío/"-" (no rompe).
- `navigator.clipboard` no disponible (contexto no seguro) → fallback: seleccionar
  el texto para copiar manual, o avisar.

## Testing

Tests unitarios de `buildWhatsappConfirmation` y `normalizePhoneForWhatsapp` al
estilo `node --test` que ya usa el proyecto (`apps/web/scripts/*.test.mjs`):

- 1 producto / varios productos.
- Con y sin `offerText`.
- Día de la semana correcto para una fecha conocida.
- Formato de fecha `DD.MM.YY`.
- Normalización de teléfono: con/sin 54, con espacios/guiones/paréntesis,
  vacío → null.

Sin tests de integración/DB (no hay backend nuevo).

## Archivos afectados

- Nuevo: `src/lib/order-confirmation.ts`
- Nuevo: `src/app/orders/new/order-confirmation-preview.tsx`
- Editar: `src/app/orders/new/order-entry-fields.tsx` (montar el preview,
  renombrar label de fecha)
- Nuevo: tests en `apps/web/scripts/` (o donde vivan los tests unitarios)
