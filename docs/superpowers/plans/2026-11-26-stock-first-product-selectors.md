# Stock-first Product Selectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ordenar las coincidencias de productos con stock primero y representar en gris los productos sin stock en los flujos comerciales y de consulta.

**Architecture:** Extender el contrato común de `SearchableSelectOption` con disponibilidad opcional y resolver el agrupamiento dentro del ranking compartido antes del límite de resultados. Cada pantalla de producto aporta su stock; Compras no lo aporta y conserva su comportamiento.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-26-stock-first-product-selectors-design.md`

## Global Constraints

- Los productos sin stock siguen siendo seleccionables.
- Stock positivo significa disponible; cero o negativo significa sin stock.
- Compras queda excluido.
- El límite de 40 se aplica después de priorizar disponibilidad.
- No se agregan dependencias.

## Review Focus

- Búsqueda vacía: disponibles primero, faltantes después, con orden estable dentro de cada grupo.
- Coincidencia exacta sin stock frente a coincidencia aproximada con stock: si ambas coinciden, mostrar primero la que tiene stock; dentro de cada grupo ordenar por calidad de búsqueda.
- Stock negativo: tratar igual que cero.
- Opciones que no son productos: conservar ranking y estilo actuales.
- Resultado remoto de Stock: respetar la respuesta filtrada y reordenar antes de limitarla.

---

### Task 1: Ranking y presentación compartidos

**Files:**
- Modify: `apps/web/src/lib/search-options.ts`
- Modify: `apps/web/src/components/ui/searchable-select.tsx`
- Test: `apps/web/scripts/search-options.test.mjs`

**Interfaces:**
- Consumes: `SearchOptionLike` y `resolveSearchOptions` existentes.
- Produces: propiedad opcional `availableStock?: number` en las opciones y resultados ordenados con disponibilidad positiva primero.

- [x] Escribir pruebas fallidas para stock positivo, cero, negativo, opciones sin metadato, búsqueda vacía y límite posterior al agrupamiento.
- [x] Ejecutar `node --test scripts/search-options.test.mjs` y verificar fallos por ausencia del comportamiento.
- [x] Implementar el ranking estable por disponibilidad sin alterar la puntuación de coincidencia.
- [x] Agregar estilo gris y etiqueta «Sin stock» en `SearchableSelect`.
- [x] Ejecutar la prueba y verificar que pasa.

### Task 2: Incorporar disponibilidad en flujos operativos

**Files:**
- Modify: `apps/web/src/app/stock/stock-product-workspace.tsx`
- Modify: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Modify: `apps/web/src/app/orders/new/sales-adjustment-fields.tsx`
- Modify: `apps/web/src/app/quotes/quote-entry-fields.tsx`
- Modify: `apps/web/src/app/prices/offers/offer-form.tsx`
- Modify: `apps/web/src/app/pricing/offers/page.tsx`
- Test: `apps/web/scripts/product-selector-stock-wiring.test.mjs`

**Interfaces:**
- Consumes: `SearchableSelectOption.availableStock` de Task 1.
- Produces: todos los selectores comerciales y de stock aportan su disponibilidad; Compras no cambia.

- [x] Escribir pruebas fallidas que ejerciten el mapeo real de cada pantalla y confirmen que Compras permanece excluido.
- [x] Ejecutar las pruebas y verificar el fallo esperado.
- [x] Añadir `availableStock` usando `stock` o `available` según el tipo de producto de cada flujo.
- [x] Ejecutar pruebas específicas, TypeScript, lint y build.
- [x] Ejecutar la suite completa y registrar cualquier falla preexistente.
- [ ] Publicar en `main`, esperar Vercel y verificar `/api/health`.
