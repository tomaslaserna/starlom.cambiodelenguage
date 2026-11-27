# Sugeridos por rubro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF comercial por rubro y presupuestos editables basados en compras reales.
**Architecture:** Un servicio agregado por empresa alimenta el PDF dinámico y las bases; reutilizar formulario y precios actuales.
**Tech Stack:** Next.js, TypeScript, PostgreSQL, PDFKit, Node tests/PGlite.
**Spec:** ../specs/2026-11-27-sugeridos-por-rubro-design.md (aprobada por Augusto).

## Global Constraints
90 días completos anteriores a hoy en Argentina. Rubros confirmados, ventas entregadas canónicas, devoluciones operativas descontadas una vez, productos activos. Sin clientes identificables en agregados. Habitual si compradores >=2 o cobertura >=20%; máximo veinte solo habituales por presupuesto. Sin modificar recomendaciones de tienda.

## Review Focus
Duplicar líneas/productos en un pedido no aumenta el denominador; NC fiscal espejo no duplica devoluciones; empresa ajena no aporta historial; producto sin precio no termina cotizado a cero; muestra vacía conserva rubro sin inventar cantidades.

### Task 1: Historial y clasificación
**Files:** Create lib/segment-guide.ts, lib/segment-guide-domain.ts, scripts/segment-guide.test.mjs; modify customer-segments.ts, catalog-management.ts, leads-domain.ts.
**Interfaces:** getSegmentGuide(companyId, now?) -> guía con fechas y rubros; buildSegmentGuide(rows, segments, period) -> grupos agregados sin identidades.
- [ ] Crear pruebas de período local, umbral, límite, promedio, SQL real con duplicados/devoluciones/tenant y rubros vacíos. Ejecutar y observar fallo.
- [ ] Implementar consulta consolidada por pedido/producto y dominio; agregar Carnicería sin reclasificar clientes.
- [ ] Ejecutar node --test scripts/segment-guide.test.mjs y confirmar verde; registrar avance.

### Task 2: Presupuestos base
**Files:** Create app/quotes/base/page.tsx; modify quotes/page.tsx, quotes/new/page.tsx, quote-entry-fields.tsx.
**Interfaces:** consume getSegmentGuide; segment query param -> initialValues sin precio congelado.
- [ ] Pruebas de selección máxima habitual y exclusión de precios inexistentes; observar fallo.
- [ ] Implementar selector por rubro, advertencias y prellenado editable; validar permiso de crear y mantener filtro de cartera.
- [ ] Verificar pruebas y TypeScript. No crear presupuesto hasta envío explícito.

### Task 3: PDF y Banco
**Files:** Create lib/pdf/segment-guide.ts, app/api/bank/segment-guide/route.ts; modify bank-client.tsx.
**Interfaces:** buildSegmentGuidePdf(guide) -> PdfFile; GET autenticado devuelve PDF privado sin cache compartida.
- [ ] Prueba con muchos productos/rubros, índice de páginas y guía vacía; observar fallo.
- [ ] Implementar PDF con índice real, presentación/unidad, compradores y denominadores, habitual/ocasional; acceso desde banco compartido.
- [ ] Renderizar PDF de prueba y revisar páginas; ejecutar build y suite pertinente.

### Task 4: Revisión y publicación
- [ ] Revisor independiente sobre diff completo, resolver hallazgos con pruebas.
- [ ] Fetch e integrar main sin sobrescribir cambios de otras tareas. Publicar y verificar despliegue.
- [ ] Verificar sesión real: Banco, PDF y presupuesto base editable sin persistencia automática. Registrar límites de evidencia si requiere login.
