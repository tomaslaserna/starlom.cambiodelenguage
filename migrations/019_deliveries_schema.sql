create table if not exists public.delivery_documents (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  delivery_number bigint,
  client_name text not null default '',
  client_document text not null default '',
  price_list_name text not null default '',
  delivery_date date,
  payment_condition text not null default '',
  total_amount numeric not null default 0,
  seller_name text not null default '',
  order_status text not null default 'pendiente_entrega',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id bigint not null default 1,
  unique (empresa_id, sale_id)
);

create index if not exists delivery_documents_empresa_number_idx
  on public.delivery_documents (empresa_id, delivery_number);

create table if not exists public.delivery_document_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.delivery_documents(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null default '',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  total_amount numeric not null default 0,
  empresa_id bigint not null default 1
);

create index if not exists delivery_document_items_empresa_delivery_idx
  on public.delivery_document_items (empresa_id, delivery_id);

create table if not exists public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  delivery_person_id uuid references public.profiles(id),
  delivery_person_name text not null default '',
  delivery_person_phone text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);

create table if not exists public.delivery_run_sales (
  id uuid primary key default gen_random_uuid(),
  delivery_run_id uuid not null references public.delivery_runs(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  empresa_id bigint not null default 1,
  unique (empresa_id, sale_id)
);

create index if not exists delivery_run_sales_empresa_run_idx
  on public.delivery_run_sales (empresa_id, delivery_run_id);
