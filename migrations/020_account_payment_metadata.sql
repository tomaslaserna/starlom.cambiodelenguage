alter table public.current_account_movements
  add column if not exists entity_type text not null default 'cliente',
  add column if not exists entity_name text not null default '';

update public.current_account_movements m
set entity_name = coalesce(nullif(m.entity_name, ''), c.display_name, '')
from public.clients c
where m.client_id = c.id
  and m.empresa_id = c.empresa_id;

alter table public.payments
  add column if not exists entity_type text not null default 'cliente',
  add column if not exists entity_name text not null default '',
  add column if not exists concept text not null default '',
  add column if not exists receipt_url text not null default '',
  add column if not exists notes text not null default '';

update public.payments p
set entity_name = coalesce(nullif(p.entity_name, ''), c.display_name, ''),
    concept = coalesce(nullif(p.concept, ''), p.reference, '')
from public.clients c
where p.client_id = c.id
  and p.empresa_id = c.empresa_id;

create index if not exists current_account_movements_empresa_entity_idx
  on public.current_account_movements (empresa_id, entity_type, entity_name);

create index if not exists payments_empresa_entity_idx
  on public.payments (empresa_id, entity_type, entity_name);
