alter table public.sales
  add column if not exists client_name text,
  add column if not exists client_document text,
  add column if not exists seller_name text,
  add column if not exists price_list_name text,
  add column if not exists payment_condition text,
  add column if not exists desired_document text,
  add column if not exists order_status text not null default 'recibido',
  add column if not exists collection_status text not null default 'pendiente',
  add column if not exists receipt_number bigint,
  add column if not exists stock_discounted boolean not null default false,
  add column if not exists collection_registered_amount numeric not null default 0,
  add column if not exists collection_date date,
  add column if not exists collection_method text,
  add column if not exists collection_destination text,
  add column if not exists collection_operation text,
  add column if not exists collection_notes text,
  add column if not exists collection_registered_by text,
  add column if not exists collection_registered_at timestamptz,
  add column if not exists collection_approved_by text,
  add column if not exists collection_approved_at timestamptz,
  add column if not exists collection_resolution_note text,
  add column if not exists collection_resolution_at timestamptz;

update public.sales s
set client_name = coalesce(s.client_name, c.display_name),
    client_document = coalesce(s.client_document, c.tax_id),
    price_list_name = coalesce(s.price_list_name, c.price_list_name),
    order_status = coalesce(nullif(s.status, ''), s.order_status, 'recibido'),
    collection_status = coalesce(nullif(s.collection_status, ''), 'pendiente')
from public.clients c
where s.client_id = c.id
  and s.empresa_id = c.empresa_id;

update public.sales
set client_name = coalesce(client_name, ''),
    client_document = coalesce(client_document, ''),
    price_list_name = coalesce(price_list_name, ''),
    payment_condition = coalesce(payment_condition, ''),
    desired_document = coalesce(desired_document, 'remito'),
    receipt_number = coalesce(receipt_number, nullif(regexp_replace(coalesce(sale_number, ''), '\D', '', 'g'), '')::bigint);

create index if not exists sales_empresa_order_status_idx
  on public.sales (empresa_id, order_status);

create index if not exists sales_empresa_collection_status_idx
  on public.sales (empresa_id, collection_status);
