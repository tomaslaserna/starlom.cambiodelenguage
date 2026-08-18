-- Presupuestos visibles para todos los vendedores en el CRM.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS visible_to_all boolean NOT NULL DEFAULT false;
