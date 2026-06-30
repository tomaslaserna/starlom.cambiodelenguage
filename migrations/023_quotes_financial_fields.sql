alter table public.quotes
  add column if not exists validity_days integer not null default 15,
  add column if not exists include_vat boolean not null default true,
  add column if not exists active_price_list integer not null default 0,
  add column if not exists discount_percent numeric not null default 0,
  add column if not exists net_amount numeric not null default 0,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists subtotal_amount numeric not null default 0,
  add column if not exists vat_amount numeric not null default 0;

update public.quotes
set subtotal_amount = case when subtotal_amount = 0 then total_amount else subtotal_amount end,
    net_amount = case when net_amount = 0 then total_amount else net_amount end
where subtotal_amount = 0
   or net_amount = 0;
