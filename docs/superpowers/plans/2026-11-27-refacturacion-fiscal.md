# Refacturación fiscal Implementation Plan

Spec: ../specs/2026-11-27-refacturacion-fiscal.md — APPROVED by user 2026-11-27.
Goal: six fiscal replacements, preserving every commercial operation.
Architecture: private starlim_arca.reissues with immutable snapshots, separate document UUID per stage; existing exact-number durable reservation and global invoice lock. No writes to commercial tables. All SQL company scoped; privileges restricted to starlim_app.

### Task 1: Persistent state and fiscal service
Files: supabase/migrations/*_fiscal_reissuance.sql, apps/web/src/lib/fiscal-reissue.ts, apps/web/scripts/fiscal-reissue.test.mjs.
Interfaces: previewFiscalReissue(companyId,saleId), executeFiscalReissue(session,saleId,reason), getFiscalReissue(companyId,saleId). Frozen source/target/details; NC receiptType 3 and replacement 1; reason required. Separate UUIDs used in invoice_attempts.
- [ ] Write behavior tests using transpile loader and fake provider/storage; observe RED.
- [ ] Generate migration via supabase migration new; private table with unique(company_id,sale_id), immutable snapshots and approvals, RLS and least privilege.
- [ ] Validate approved A, VAT21, CUIT, positive amount, details and absence of adjustments; freeze recipients before calls.
- [ ] Durable stage transition, exact-number reservation and reentry after timeout. Preserve NC approval if replacement fails. Test retries, rejection, ambiguity, concurrent execution, tenant isolation and unchanged commercial data with PGlite.
Expected: node --test scripts/fiscal-reissue.test.mjs passes, no commercial-table writes.

### Task 2: ERP integration and snapshots
Files: billing/reissue/[id]/page.tsx + actions.ts; api/pdfs/fiscal/reissues/[id]/route.ts; lib/pdf/documents.ts; lib/fiscal-ledger.ts; lib/fiscal.ts; billing/page.tsx.
Interfaces: consume Task1 snapshots/approvals. Existing original fiscal documents never overwritten; normal notes blocked on reissued sale.
- [ ] Add authorized preview/execute/retry form and links to original, NC and replacement PDFs, explicit incomplete state.
- [ ] Render original/NC/replacement from immutable snapshots with reason and associated receipt, CAE, QR.
- [ ] Include replacement and NC in fiscal period VAT aggregates, never commercial reports.
- [ ] Test integration, permissions, ledger arithmetic, PDFs and conflicting note guards.
Expected: focused tests + existing fiscal/accounting tests + TypeScript/lint/build pass.

### Task 3: Review, deploy and six replacements
- [ ] Fresh independent branch review; address important findings and rerun tests.
- [ ] Deploy migration and application through authorized existing infrastructure; verify production read-only.
- [ ] Revalidate six original invoices and target CORTEO CUIT30714850748; total2959833.02.
- [ ] Snapshot commercial counts/balances; execute sequential NC/replacement pairs, stop on incomplete state.
- [ ] Reconcile all12 new approvals, reason and PDF snapshots; verify commercial invariants and provide document links.
Expected: six complete pairs and zero commercial mutation. Never use real fiscal documents as a test.
