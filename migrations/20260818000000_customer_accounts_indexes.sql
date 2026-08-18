-- Cuenta corriente con saldo corrido: aceleran la bandeja de pagos pendientes
-- y el estado de cuenta por cliente. Aditivo e idempotente.
alter table public.payments
  add column if not exists updated_at timestamptz not null default now();

create index if not exists payments_empresa_status_idx
  on public.payments (empresa_id, status, payment_date desc);

create index if not exists current_account_movements_empresa_client_date_idx
  on public.current_account_movements (empresa_id, client_id, movement_date);
