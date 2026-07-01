# Contexto para Tomás (y su IA) — Departamento Comercial

Este documento resume qué venimos construyendo del lado de Augusto sobre `main`,
para que Tomás y su asistente tengan contexto y no pisemos trabajo. Última
actualización: 2026-07-01.

## Visión general

Estamos construyendo un **departamento Comercial** dentro del ERP: un espacio de
trabajo para los agentes comerciales que hoy dependen de notas dispersas (Excel,
papel, celular). La idea es que el CRM **no sea una app aparte**, sino pestañas del
mismo ERP, y que el comercial pueda llevar la gestión de la venta hasta el punto en
que le toca a administración (tomar el pedido confirmado, armarlo, remitirlo,
facturarlo).

Todo esto vive en la sección de menú **Comercial** (antes "Operaciones"), con
submenús **Pedidos / Ventas / Presupuestos**.

## Ya hecho y commiteado en `main` (esta tanda de commits)

1. **Navegación reorganizada:**
   - Sección **Inicio** ahora contiene Calendario y Mensajes; se quitó el link
     "Inicio" redundante (se llega al dashboard por el logo).
   - "Operaciones" → **Comercial**, con submenús Pedidos / Ventas / Presupuestos.

2. **Generador de confirmación para WhatsApp** (en "Cargar pedido", `/orders/new`):
   - Mientras el comercial arma el pedido, ve en vivo un mensaje de confirmación
     formateado (formato nativo de WhatsApp), con botones **Copiar** y **Abrir en
     WhatsApp** (`wa.me` con el teléfono del cliente) y un campo de **oferta**.
   - Código: `lib/order-confirmation.ts` (función pura + tests unitarios) y
     `app/orders/new/order-confirmation-preview.tsx`.

3. **Editar pedidos confirmados:**
   - Antes solo se editaban los `cargado`. Ahora también los `confirmado`: al
     guardar, el pedido **vuelve a `cargado`** para reconfirmarlo (se libera la
     reserva de stock, que es computada). Cambios en `lib/orders.ts`
     (`updateBasicOrder`), `app/orders/[id]/edit/page.tsx`, `app/orders/page.tsx`.

4. Confirmamos que el **registro de pedidos unificado ya existía** (`/orders` con
   filtros y acciones) — no se rehízo.

> Nota técnica: el trabajo asume la base Supabase nueva (esquema en inglés,
> proyecto `tkpapbinlplqfhoxesuk`). Las credenciales van en `apps/web/.env.local`
> (gitignored), nunca al repo.

## En curso (spec aprobado, falta implementar)

**Ofertas (Fase A)** — spec en `docs/superpowers/specs/2026-07-01-offers-phase-a-design.md`.
- Tabla nueva `offers` (migración `033_create_offers.sql`, aditiva): título, texto,
  activa, producto opcional.
- ABM en `/pricing/offers` (subpágina de Precios) + link desde la página de Precios.
- Selector de ofertas activas en el generador de WhatsApp (llena la línea 💡).
- Es **descriptivo** (sin cálculo de descuentos, sin gating por punto de equilibrio
  todavía).
- **Pendiente:** aplicar la migración 033 a la base Supabase compartida.

## Roadmap Comercial (próximos cambios, más allá de lo actual)

Orden tentativo, cada uno con su propio diseño antes de codear:

1. **Punto de equilibrio + gating de ofertas (Fase B de Ofertas):** motor que
   calcula si la empresa alcanzó su break-even y, recién ahí, habilita ofertas.
   Requiere definir costos fijos/variables, período y fórmula. Ya existe
   `costos_operativos` como insumo.

2. **Circuito de venta negro/blanco:** al confirmar un pedido, definir si el cliente
   compra en negro (remito de control de mercadería + **remito interno**, que suma
   IVA al 10,5%) o en blanco (remito de control + **factura**, IVA 21%). Es el más
   complejo (fiscal). Ya hay base: `sales_internal_documents`, `receipt-types.ts`,
   `billing_document`.

3. **Doble stock (real vs disponible):** ya existe el concepto (disponible = real −
   reservado por confirmados; el real se descuenta al entregar). Puede necesitar
   pulido de UI.

4. **Presupuestos rápido / formal:**
   - Rápido: mensaje de WhatsApp corto (2-3 ítems) con precio, listo para enviar.
   - Formal: PDF con vigencia (7/15 días) + registro de emitidos/vigentes/vencidos;
     los aprobados pasan a pedidos respetando el precio presupuestado.

5. **CRM / seguimiento de clientes (visión más amplia):**
   - **Recompra inteligente:** detectar clientes que se "enfrían" respecto a su
     propio histórico (caída de frecuencia/volumen) y sugerir a quién contactar,
     con carrito sugerido según lo que suele llevar.
   - **Ficha 360° del cliente:** historial, qué suele llevar, contactos, notas,
     cuenta corriente.
   - **Pipeline de prospectos:** clientes a capturar / a retomar, con seguimiento.
   - **Ranking de clientes** y registro de contactos/recordatorios por cliente.
   - Visibilidad: cada comercial ve su cartera (campo `seller` del cliente), el jefe
     ve todo; reasignación configurable.

## Cómo trabajamos (por si su IA colabora sobre lo mismo)

- Cada feature: diseño (spec en `docs/superpowers/specs/`) → plan (`.../plans/`) →
  implementación → verificación. Especificaciones y planes quedan versionados.
- Verificación de lógica que toca la base: flujo real autenticado (no hay harness
  de tests de DB/UI). Lógica pura: `node --test` en `apps/web/scripts/`.
- **Coordinación:** si ambos tocan `navigation.ts`, `lib/orders.ts`, el generador de
  WhatsApp o el módulo de precios, avisar para evitar conflictos. El detalle fino de
  cada cambio está en los specs/plans de `docs/superpowers/`.
