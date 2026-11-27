# Prospect Quote Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar inmediatamente los presupuestos pendientes de prospectos al Motor de ventas, sin duplicar oportunidades, y programar el recontacto de Espacio O2.

**Architecture:** Mantener `quotes.seller_id` como fuente de responsabilidad comercial y modificar solamente la composición pura de misiones. Los presupuestos de prospectos se deduplican por nombre normalizado antes de crear una misión; `sales_mission_completions` continúa siendo la única fuente para ocultar y reactivar seguimientos.

**Tech Stack:** Next.js 16, TypeScript, PostgreSQL/Supabase, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-27-prospect-quote-followup-design.md`

## Global Constraints

- No crear automáticamente clientes ni leads.
- No cambiar la atribución histórica: el vendedor proviene de `quotes.seller_id`.
- Mostrar sólo el presupuesto pendiente más reciente por prospecto y vendedor.
- Mantener sin cambios el comportamiento de presupuestos de clientes registrados.
- Mantener la exclusión del archivo vencido anterior al 15/10/2026.

## Review Focus

- Dos nombres equivalentes por mayúsculas, acentos o espacios deben generar una sola misión.
- Dos prospectos distintos deben conservar misiones separadas.
- El presupuesto más reciente debe ganar aunque otro presupuesto equivalente esté más cerca de vencer.
- Una misión reprogramada a futuro no debe aparecer antes de la fecha elegida.
- Los presupuestos vigentes de clientes registrados no deben agregarse anticipadamente.

---

### Task 1: Composición de misiones de prospectos

**Files:**
- Modify: `apps/web/src/lib/crm-missions.ts`
- Modify: `apps/web/scripts/crm-missions.test.mjs`

**Interfaces:**
- Consumes: `VendorQuote`, `QuoteBucket` y `SalesMissionStateMap` existentes.
- Produces: `buildCrmMissions(input: MissionInput): CrmMission[]` con una misión inmediata por prospecto pendiente más reciente.

- [ ] **Step 1: Escribir pruebas fallidas de comportamiento**

Agregar casos con valores literales que verifiquen: aparición inmediata de un prospecto vigente; deduplicación de `Espacio O2`/`ESPÁCIO   O2`; selección de P-0133 sobre P-0130; separación de nombres distintos; exclusión de un cliente registrado vigente; ocultamiento hasta `nextFollowupOn`.

- [ ] **Step 2: Ejecutar la prueba y verificar RED**

Run: `node --test scripts/crm-missions.test.mjs`

Expected: FAIL porque `quotes.vigentes` todavía no genera misiones para prospectos.

- [ ] **Step 3: Implementar la regla mínima**

En `crm-missions.ts`, normalizar la identidad del prospecto con Unicode NFD, minúsculas y espacios compactados; seleccionar por `issueDate` el presupuesto pendiente más reciente de cada identidad; crear una misión `presupuesto` con urgencia `proximo`; excluir esos prospectos de los bucles actuales de `por_vencer` y `vencidos` para evitar duplicados.

- [ ] **Step 4: Ejecutar pruebas específicas**

Run: `node --test scripts/crm-missions.test.mjs scripts/sales-mission-completion.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/crm-missions.ts apps/web/scripts/crm-missions.test.mjs
git commit -m "feat: seguir presupuestos de prospectos en motor"
```

### Task 2: Presentación y validación integral

**Files:**
- Modify: `apps/web/src/app/sales-engine/daily-missions.tsx`
- Modify: `apps/web/src/app/sales-engine/page.tsx`
- Test: `apps/web/scripts/sales-mission-completion.test.mjs`

**Interfaces:**
- Consumes: misiones `presupuesto` con urgencia `proximo` de Task 1.
- Produces: textos del Motor que explican propuestas nuevas, próximas a vencer y vencidas.

- [ ] **Step 1: Escribir una prueba fallida para el texto operativo**

Verificar que la explicación de Presupuestos incluya propuestas nuevas además de próximas a vencer o vencidas.

- [ ] **Step 2: Ejecutar y verificar RED**

Run: `node --test scripts/sales-mission-completion.test.mjs`

Expected: FAIL con el texto actual limitado a vencimientos.

- [ ] **Step 3: Actualizar los textos sin cambiar el flujo**

Modificar únicamente la explicación de la tarjeta y la sección “Cómo decide el motor”.

- [ ] **Step 4: Verificación técnica**

Run: `node --test scripts/crm-missions.test.mjs scripts/sales-mission-completion.test.mjs && npx eslint src/lib/crm-missions.ts src/app/sales-engine/daily-missions.tsx src/app/sales-engine/page.tsx && npx tsc --noEmit && npm run build`

Expected: pruebas, lint, TypeScript y build exitosos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/sales-engine/daily-missions.tsx apps/web/src/app/sales-engine/page.tsx apps/web/scripts/sales-mission-completion.test.mjs
git commit -m "copy: explicar seguimiento de presupuestos nuevos"
```

### Task 3: Programar Espacio O2 y verificar producción

**Files:**
- No code files.
- Data: `sales_mission_completions` de STARLIM ERP.

**Interfaces:**
- Consumes: presupuesto P-0133 y su `seller_id` actual.
- Produces: recontacto `quote-0b3bec3d-799d-4f31-a7a9-d7c282c0faf7` para `2027-01-25`.

- [ ] **Step 1: Consultar nuevamente el presupuesto antes de escribir**

Confirmar que P-0133 continúa pendiente, pertenece a Espacio O2 y está asignado a Matías Ferrer.

- [ ] **Step 2: Insertar el ciclo de seguimiento**

Insertar en `sales_mission_completions` una finalización para P-0133, vendedor Matías, fecha `2027-01-25` y nota “Por el momento está bien; volver a medir disponibilidad y necesidad”.

- [ ] **Step 3: Verificar la persistencia**

Consultar el último ciclo de la misión y comprobar vendedor, fecha, nota y presupuesto pendiente.

- [ ] **Step 4: Publicar y verificar**

Publicar en `main`, esperar Vercel y verificar `https://starlim.vercel.app/api/health` con estado 200.
