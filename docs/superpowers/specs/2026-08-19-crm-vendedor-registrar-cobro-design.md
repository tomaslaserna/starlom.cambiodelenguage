# Reactivar registro de cobro del vendedor (nivel cuenta)

**Fecha:** 2026-08-19
**Estado:** Diseño aprobado, pendiente de plan
**Contexto:** Follow-up de [cuenta corriente saldo corrido](2026-08-18-cobros-pagos-cuenta-corriente-design.md). Depende del código de esa rama (`feat/cobros-cuenta-corriente` / `customer-accounts.ts`).

## Problema

Al reorientar cobros a nivel cuenta (saldo corrido), la pestaña `/crm/cobros` pasó a mostrar el saldo corrido de los clientes del vendedor, pero **se quitó el botón de registrar cobro**. La acción vieja (`registerCrmCollectionAction`) era por `saleId` y llamaba al flujo factura-céntrico (`registerCollection`), incompatible con el modelo nuevo. Resultado: el vendedor ve la deuda de sus clientes pero no puede registrar un cobro.

## Objetivo

Reactivar el registro de cobro del vendedor sobre el **modelo a nivel cuenta**: desde `/crm/cobros`, el vendedor registra un pago para un cliente propio o a cargo; el pago queda `pendiente_aprobacion` y se resuelve en `/admin/approvals` (igual que cualquier pago cargado por alguien sin permiso de aprobar).

## Alcance

Solo el botón "Registrar cobro" por fila de cliente. **No** se agrega un estado de cuenta read-only para el vendedor en el CRM (queda para un follow-up si se pide).

## Componentes

### 1. Guard `assertVendorOwnsClient` (en `apps/web/src/lib/crm.ts`)
Análogo a `assertVendorOwnsSale`, pero valida por `clientId` en vez de `saleId`. El cliente debe ser propio (`clients.seller_name`) o a cargo (`clients.assigned_seller`) del vendedor, usando `sellerCandidates(session)`. Si no, lanza `ApiError(403, ...)`.

```ts
export async function assertVendorOwnsClient(session: AuthSession, clientId: string): Promise<void>;
```

### 2. Acción CRM `registerCrmCustomerPaymentAction` (en `apps/web/src/app/crm/cobros/actions.ts`)
Server action gateada por `CRM_READ_PERMISSION` (`crm.ver`, sin permiso global de cobranzas). Toma `clientId` + campos del pago del `FormData`, valida `clientId` con `uuidParam`, corre `assertVendorOwnsClient`, y luego `registerCustomerPayment(session, customerPaymentFromBody(...))` (de `customer-accounts.ts`).

Como el vendedor no tiene `cobranzas.aprobar`, `registerCustomerPayment` deja el pago en `pendiente_aprobacion` (sin impactar el saldo). No hay que tocar el flujo híbrido. Revalida `/crm/cobros` y `/admin/approvals`.

> Reutiliza `customerPaymentFromBody` (que ya valida monto/método/destino/operación) para no duplicar validación.

### 3. UI en `apps/web/src/app/crm/cobros/page.tsx`
Botón "Registrar cobro" por fila (cliente) que abre el `RegisterPaymentDialog` existente (`apps/web/src/app/payments/register-payment-dialog.tsx`). Props reales del diálogo: `action`, `customers: PaymentCustomerOption[]` (requerido), `defaultCustomerId?`, `today`, `triggerLabel?`, `triggerClassName?`. Se pasa `action={registerCrmCustomerPaymentAction}`, `defaultCustomerId={account.clientId}`, `customers={[]}` (el diálogo oculta el selector cuando hay `defaultCustomerId`, emitiendo un `<input hidden name="clientId">`, así que no hace falta la lista), `today`, y `triggerLabel="Registrar cobro"`. El cliente ya queda identificado por la fila/botón; el diálogo no muestra el nombre (no tiene prop para eso).

### 4. Limpieza del flujo viejo (incluida)
Borrar el rastro factura-céntrico del vendedor, ahora dead code:
- `registerCrmCollectionAction` en `crm/cobros/actions.ts` (huérfana; usaba `registerCollection` por `saleId`).
- `assertVendorOwnsSale` en `crm.ts` (queda sin uso al borrar la acción de arriba).
- `getVendorCollections` en `crm.ts` (dead code marcado en el review de la rama padre; su único consumidor era la vieja `/crm/cobros`).
- Los tests que ejercitan esas funciones (`crm-vendor.test.mjs`) se actualizan/borran según corresponda.

## Seguridad y multi-tenant

- `clientId` viene del `FormData` → validar con `uuidParam` + `assertVendorOwnsClient` (no puede registrar cobros de clientes ajenos).
- Toda query filtra por `empresa_id`, parámetros `$n`.
- El vendedor nunca impacta el saldo directamente: siempre `pendiente_aprobacion`.

## Testing

- `assertVendorOwnsClient`: cliente propio → OK; a cargo → OK; ajeno → `ApiError(403)`.
- Wiring de `registerCrmCustomerPaymentAction`: gate `CRM_READ_PERMISSION`, llama `assertVendorOwnsClient` antes de `registerCustomerPayment`, revalida `/crm/cobros` + `/admin/approvals`.
- Confirmar que al borrar el dead code no quedan imports colgados ni tests referenciando funciones inexistentes; suite sin fallas nuevas (base: 11 pre-existentes).

## Fuera de alcance

- Estado de cuenta read-only del cliente dentro del CRM (para vendedores sin permiso global).
- Cualquier cambio al flujo de aprobación o al modelo de saldo (ya construidos).
