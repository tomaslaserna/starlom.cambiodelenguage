alter table public.sales
  add column if not exists receipt_type integer not null default 0,
  add column if not exists tracking_status text not null default 'no_facturada';

create table if not exists public.sales_admin_audit (
  id uuid primary key default gen_random_uuid(),
  employee text not null default '',
  sale_id uuid references public.sales(id) on delete set null,
  sale_label text not null default '',
  action text not null default '',
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);

create index if not exists sales_admin_audit_empresa_created_idx
  on public.sales_admin_audit (empresa_id, created_at desc);
