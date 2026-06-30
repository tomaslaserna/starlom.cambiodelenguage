alter table public.sales
  add column if not exists source_operator_name text,
  add column if not exists source_cost_amount numeric(14,2),
  add column if not exists source_net_amount numeric(14,2),
  add column if not exists source_profit_amount numeric(14,2),
  add column if not exists source_receipt_label text,
  add column if not exists source_payment_term_days integer;
