alter table public.sales
  add column if not exists fiscal_status text not null default 'no_enviado',
  add column if not exists fiscal_provider text not null default 'arca',
  add column if not exists fiscal_mode text not null default '',
  add column if not exists fiscal_document_source text not null default 'sale',
  add column if not exists fiscal_document_kind text not null default 'invoice',
  add column if not exists cae text not null default '',
  add column if not exists cae_expires_at date,
  add column if not exists fiscal_authorized_at timestamptz,
  add column if not exists fiscal_last_attempt_at timestamptz,
  add column if not exists fiscal_error_code text not null default '',
  add column if not exists fiscal_error_message text not null default '',
  add column if not exists fiscal_observations jsonb not null default '[]'::jsonb;

alter table public.sales
  drop constraint if exists sales_fiscal_status_check;

alter table public.sales
  add constraint sales_fiscal_status_check
  check (fiscal_status in ('no_enviado', 'pendiente', 'aprobado', 'rechazado', 'error'));

update public.sales
set fiscal_status = 'aprobado',
    fiscal_provider = 'manual',
    fiscal_authorized_at = coalesce(fiscal_authorized_at, updated_at, sale_date::timestamptz, now()),
    cae = coalesce(nullif(cae, ''), 'manual')
where coalesce(tracking_status, '') = 'facturada'
  and coalesce(fiscal_status, 'no_enviado') = 'no_enviado';

create index if not exists sales_empresa_fiscal_status_idx
  on public.sales (empresa_id, fiscal_status, sale_date desc);

create index if not exists sales_empresa_cae_idx
  on public.sales (empresa_id, cae)
  where cae <> '';

alter table public.sales_internal_documents
  add column if not exists fiscal_status text not null default 'no_enviado',
  add column if not exists fiscal_provider text not null default 'arca',
  add column if not exists fiscal_mode text not null default '',
  add column if not exists fiscal_document_source text not null default 'sales_document',
  add column if not exists fiscal_document_kind text not null default 'credit_note',
  add column if not exists cae text not null default '',
  add column if not exists cae_expires_at date,
  add column if not exists fiscal_authorized_at timestamptz,
  add column if not exists fiscal_last_attempt_at timestamptz,
  add column if not exists fiscal_error_code text not null default '',
  add column if not exists fiscal_error_message text not null default '',
  add column if not exists fiscal_observations jsonb not null default '[]'::jsonb;

alter table public.sales_internal_documents
  drop constraint if exists sales_internal_documents_fiscal_status_check;

alter table public.sales_internal_documents
  add constraint sales_internal_documents_fiscal_status_check
  check (fiscal_status in ('no_enviado', 'pendiente', 'aprobado', 'rechazado', 'error'));

create index if not exists sales_internal_documents_empresa_fiscal_status_idx
  on public.sales_internal_documents (empresa_id, fiscal_status, created_at desc);

comment on column public.sales.fiscal_status is
  'Estado real de autorizacion fiscal ARCA/CAE. No reemplaza el estado comercial del pedido.';

comment on column public.sales.cae is
  'Codigo de autorizacion electronico. Sin CAE real no hay factura fiscal aprobada.';
