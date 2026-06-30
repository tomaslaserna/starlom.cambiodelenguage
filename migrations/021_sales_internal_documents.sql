create table if not exists public.sales_internal_documents (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete cascade,
  delivery_id uuid references public.delivery_documents(id) on delete cascade,
  class_name text not null check (class_name in ('NC', 'ND')),
  fiscal boolean not null default false,
  receipt_type integer not null default 0,
  receipt_number bigint,
  amount numeric not null default 0,
  detail_json jsonb not null default '[]'::jsonb,
  reason text not null default '',
  stock_adjusted boolean not null default false,
  created_by uuid references public.profiles(id),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);

create index if not exists sales_internal_documents_empresa_sale_idx
  on public.sales_internal_documents (empresa_id, sale_id);

create index if not exists sales_internal_documents_empresa_delivery_idx
  on public.sales_internal_documents (empresa_id, delivery_id);
