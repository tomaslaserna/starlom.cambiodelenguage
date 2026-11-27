CREATE TABLE starlim_arca.reissues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id integer NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  credit_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','credit_pending','credit_approved','invoice_pending','completed','review_required')),
  credit jsonb, invoice jsonb,
  error text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id,sale_id), CHECK(credit_id <> invoice_id),
  CHECK (invoice IS NULL OR credit IS NOT NULL),
  CHECK (state <> 'completed' OR (invoice IS NOT NULL AND credit IS NOT NULL))
);
CREATE UNIQUE INDEX reissues_original_receipt ON starlim_arca.reissues
 (company_id,(snapshot->'original'->>'pointOfSale'),(snapshot->'original'->>'receiptType'),(snapshot->'original'->>'receiptNumber'));
ALTER TABLE starlim_arca.reissues ENABLE ROW LEVEL SECURITY;
ALTER TABLE starlim_arca.reissues FORCE ROW LEVEL SECURITY;
CREATE POLICY reissues_company ON starlim_arca.reissues FOR ALL TO starlim_app
 USING (company_id = nullif(current_setting('app.current_empresa_id',true),'')::integer)
 WITH CHECK (company_id = nullif(current_setting('app.current_empresa_id',true),'')::integer);
REVOKE ALL ON starlim_arca.reissues FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON starlim_arca.reissues TO starlim_app;

-- Both creation paths take the same per-sale transaction lock. A commercial
-- adjustment cannot slip between prevalidation and the committed fiscal record.
CREATE FUNCTION starlim_arca.guard_reissue() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.company_id,NEW.sale_id,NEW.snapshot,NEW.reason,NEW.credit_id,NEW.invoice_id,NEW.created_by,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.company_id,OLD.sale_id,OLD.snapshot,OLD.reason,OLD.credit_id,OLD.invoice_id,OLD.created_by,OLD.created_at)
      OR (OLD.credit IS NOT NULL AND NEW.credit IS DISTINCT FROM OLD.credit)
      OR (OLD.invoice IS NOT NULL AND NEW.invoice IS DISTINCT FROM OLD.invoice)
      OR (OLD.state='completed' AND NEW.state<>'completed') THEN
     RAISE EXCEPTION 'El expediente y las autorizaciones fiscales son inmutables';
   END IF;
 ELSE
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.company_id::text||':'||NEW.sale_id::text,173));
   IF NOT EXISTS (SELECT 1 FROM public.sales WHERE id=NEW.sale_id AND empresa_id=NEW.company_id AND fiscal_status='aprobado') THEN
     RAISE EXCEPTION 'La factura no pertenece a la empresa o no está aprobada';
   END IF;
   IF EXISTS (
     SELECT 1 FROM public.sales_internal_documents d
     WHERE d.sale_id=NEW.sale_id AND d.empresa_id=NEW.company_id AND d.class_name IN ('NC','ND')
       AND (d.class_name<>'NC' OR d.fiscal OR NOT d.account_adjusted OR NOT d.stock_adjusted
         OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'operationalReturns','[]'::jsonb)) n
           WHERE n->>'id'=d.id::text AND (n->>'amount')::numeric=d.amount AND n->'detail'=d.detail_json))
   ) OR (SELECT count(*) FROM public.sales_internal_documents WHERE sale_id=NEW.sale_id AND empresa_id=NEW.company_id AND class_name IN ('NC','ND'))
      <> pg_catalog.jsonb_array_length(COALESCE(NEW.snapshot->'operationalReturns','[]'::jsonb)) THEN
     RAISE EXCEPTION 'La venta tiene ajustes previos; requiere conciliación';
   END IF;
   IF NEW.snapshot ? 'replacementTotal' AND
     (NEW.snapshot->>'replacementTotal')::numeric <> (NEW.snapshot->>'total')::numeric -
       (SELECT COALESCE(sum((n->>'amount')::numeric),0) FROM pg_catalog.jsonb_array_elements(NEW.snapshot->'operationalReturns') n) THEN
     RAISE EXCEPTION 'El importe neto de reemplazo no coincide con las devoluciones';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_reissue BEFORE INSERT OR UPDATE ON starlim_arca.reissues FOR EACH ROW EXECUTE FUNCTION starlim_arca.guard_reissue();
CREATE FUNCTION starlim_arca.guard_reissued_sale_note() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.class_name IN ('NC','ND') THEN
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.empresa_id::text||':'||NEW.sale_id::text,173));
   IF EXISTS (SELECT 1 FROM starlim_arca.reissues WHERE company_id=NEW.empresa_id AND sale_id=NEW.sale_id) THEN
     RAISE EXCEPTION 'La venta tiene una refacturación fiscal. Usá su expediente y conciliá cualquier ajuste posterior.';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_reissued_sale_note BEFORE INSERT OR UPDATE ON public.sales_internal_documents FOR EACH ROW EXECUTE FUNCTION starlim_arca.guard_reissued_sale_note();
REVOKE ALL ON FUNCTION starlim_arca.guard_reissue(),starlim_arca.guard_reissued_sale_note() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION starlim_arca.guard_reissue(),starlim_arca.guard_reissued_sale_note() TO starlim_app;
