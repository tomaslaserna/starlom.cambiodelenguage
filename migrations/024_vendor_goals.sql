create table if not exists public.vendor_goals (
  id uuid primary key default gen_random_uuid(),
  empresa_id bigint not null default 1,
  vendor text not null,
  period date not null,
  goal_sales numeric not null default 0,
  goal_clients integer not null default 0,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, vendor, period)
);

create index if not exists idx_vendor_goals_company_period
  on public.vendor_goals (empresa_id, period);
