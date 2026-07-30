-- Keep UUID primary keys internal while persisting the commercial snapshot that
-- makes a quote usable without creating a client record first.
alter table public.quotes
  add column if not exists client_name text not null default '',
  add column if not exists client_legal_name text not null default '',
  add column if not exists client_document text not null default '',
  add column if not exists client_fiscal_condition text not null default '',
  add column if not exists client_phone text not null default '',
  add column if not exists client_address text not null default '',
  add column if not exists vat_rate numeric(4, 1) not null default 0;

alter table public.sales
  add column if not exists commercial_number bigint;

alter table public.quotes
  alter column include_vat set default false;

update public.quotes q
set client_name = coalesce(nullif(q.client_name, ''), c.display_name, c.legal_name, ''),
    client_legal_name = coalesce(nullif(q.client_legal_name, ''), c.legal_name, c.display_name, ''),
    client_document = coalesce(nullif(q.client_document, ''), c.tax_id, ''),
    client_fiscal_condition = coalesce(nullif(q.client_fiscal_condition, ''), c.fiscal_condition, ''),
    client_phone = coalesce(nullif(q.client_phone, ''), c.phone, ''),
    client_address = coalesce(nullif(q.client_address, ''), c.address, '')
from public.clients c
where c.id = q.client_id
  and c.empresa_id = q.empresa_id;

-- Previous code never calculated VAT even when an old schema default marked it
-- visible. Preserve existing totals by keeping all legacy rows without VAT.
update public.quotes
set include_vat = false,
    vat_rate = 0,
    vat_amount = 0;

-- The original single-company constraints prevent the same readable number in
-- two companies. Tenant-scoped unique indexes already protect both columns.
alter table public.quotes drop constraint if exists quotes_quote_number_key;
alter table public.sales drop constraint if exists sales_sale_number_key;

-- Existing quotes become P-0001, P-0002, ... in creation order per company.
update public.quotes
set quote_number = 'TMP-QUOTE-' || id::text;

with numbered as (
  select id,
         row_number() over (partition by empresa_id order by created_at, id) as commercial_number
  from public.quotes
)
update public.quotes q
set quote_number = 'P-' || lpad(
      numbered.commercial_number::text,
      greatest(4, length(numbered.commercial_number::text)),
      '0'
    )
from numbered
where numbered.id = q.id;

alter table public.quotes
  alter column quote_number set not null;

-- P-* rows are orders created by this application. Give them a separate,
-- readable code without rewriting sale_number or any historical reference.
with numbered as (
  select id,
         row_number() over (partition by empresa_id order by created_at, id) as commercial_number
  from public.sales
  where sale_number ~ '^P-[0-9]+$'
)
update public.sales s
set commercial_number = numbered.commercial_number
from numbered
where numbered.id = s.id
  and s.commercial_number is null;

create unique index if not exists ux_quotes_empresa_quote_number_not_null
  on public.quotes (empresa_id, quote_number)
  where quote_number is not null;

create unique index if not exists ux_sales_empresa_sale_number_not_null
  on public.sales (empresa_id, sale_number)
  where sale_number is not null;

create unique index if not exists ux_sales_empresa_commercial_number_not_null
  on public.sales (empresa_id, commercial_number)
  where commercial_number is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_commercial_number_check'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_commercial_number_check
      check (commercial_number is null or commercial_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_vat_rate_check'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_vat_rate_check
      check (vat_rate in (0, 10.5, 21));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_vat_visibility_check'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_vat_visibility_check
      check (
        (include_vat = false and vat_rate = 0)
        or (include_vat = true and vat_rate in (10.5, 21))
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'quotes_customer_reference_check'
      and conrelid = 'public.quotes'::regclass
  ) then
    alter table public.quotes
      add constraint quotes_customer_reference_check
      check (
        client_id is not null
        or btrim(client_name) <> ''
        or btrim(client_legal_name) <> ''
      );
  end if;
end
$$;

comment on column public.quotes.client_name is
  'Snapshot del nombre usado en el presupuesto; permite prospectos sin alta en clients.';
comment on column public.quotes.vat_rate is
  'Tasa de IVA agregada al presupuesto: 0, 10.5 o 21.';
comment on column public.sales.commercial_number is
  'Codigo operativo estable y legible de pedido/venta; no es remito ni comprobante fiscal.';
