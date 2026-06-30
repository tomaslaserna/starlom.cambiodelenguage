alter table public.current_account_movements
  alter column client_id drop not null,
  add column if not exists purchase_id uuid;

alter table public.payments
  add column if not exists purchase_id uuid;

create index if not exists idx_current_account_movements_purchase
  on public.current_account_movements (empresa_id, purchase_id);

create index if not exists idx_payments_purchase
  on public.payments (empresa_id, purchase_id);
