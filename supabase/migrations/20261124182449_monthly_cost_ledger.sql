-- Prepared only: no legacy payroll, cost or treasury record is changed.
CREATE TABLE public.admin_monthly_cost_ledger (
 empresa_id bigint PRIMARY KEY,
 state jsonb NOT NULL,
 source_snapshot jsonb NOT NULL,
 updated_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT monthly_cost_company CHECK ((state->>'companyId')::bigint=empresa_id),
 CONSTRAINT monthly_cost_revision CHECK ((state->>'revision')::bigint>=0)
);
ALTER TABLE public.admin_monthly_cost_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_monthly_cost_ledger FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.admin_monthly_cost_ledger TO starlim_app;
CREATE POLICY monthly_cost_company ON public.admin_monthly_cost_ledger FOR ALL TO starlim_app
 USING (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
 WITH CHECK (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);

CREATE FUNCTION public.protect_monthly_cost_snapshots() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE saved record;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Monthly cost history cannot be deleted'; END IF;
 IF NEW.empresa_id<>OLD.empresa_id OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
  OR NEW.state->>'baselineMonth' IS DISTINCT FROM OLD.state->>'baselineMonth'
  OR (NEW.state->>'revision')::bigint<>(OLD.state->>'revision')::bigint+1 THEN
  RAISE EXCEPTION 'Invalid monthly cost revision';
 END IF;
 FOR saved IN SELECT key,value FROM jsonb_each(OLD.state->'snapshots') LOOP
  IF NEW.state->'snapshots'->saved.key IS DISTINCT FROM saved.value THEN
   RAISE EXCEPTION 'Saved monthly costs are immutable';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_monthly_cost_snapshots() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_monthly_cost_snapshots BEFORE UPDATE OR DELETE ON public.admin_monthly_cost_ledger
 FOR EACH ROW EXECUTE FUNCTION public.protect_monthly_cost_snapshots();

-- Once explicitly activated, the original sources remain frozen as the historical baseline.
CREATE FUNCTION public.protect_monthly_cost_sources() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 -- Share the activation lock, so concurrent writes cannot slip into its baseline.
 PERFORM pg_advisory_xact_lock(71624,(CASE WHEN TG_OP='DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END)::integer);
 IF TG_OP='UPDATE' AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
  RAISE EXCEPTION 'Cost source company cannot be changed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.admin_monthly_cost_ledger WHERE empresa_id=CASE WHEN TG_OP='DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END)
 THEN RAISE EXCEPTION 'Use monthly cost versions; historical sources are protected'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_monthly_cost_sources() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER monthly_cost_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.costos_operativos
 FOR EACH ROW EXECUTE FUNCTION public.protect_monthly_cost_sources();
CREATE TRIGGER monthly_salary_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.admin_sueldos_config
 FOR EACH ROW EXECUTE FUNCTION public.protect_monthly_cost_sources();
CREATE TRIGGER monthly_decision_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.admin_operating_cost_month_status
 FOR EACH ROW EXECUTE FUNCTION public.protect_monthly_cost_sources();
