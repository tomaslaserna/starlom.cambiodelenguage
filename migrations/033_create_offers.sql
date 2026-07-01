create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  active boolean not null default true,
  product_id uuid references public.products(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);

create index if not exists offers_empresa_active_idx on public.offers (empresa_id, active);
