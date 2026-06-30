create unique index if not exists payments_empresa_source_row_uidx
  on public.payments (empresa_id, source_sheet, source_row)
  where source_sheet is not null and source_row is not null;

alter table public.sale_items
  add column if not exists source_sheet text,
  add column if not exists source_row integer;

create unique index if not exists sale_items_empresa_source_row_uidx
  on public.sale_items (empresa_id, source_sheet, source_row)
  where source_sheet is not null and source_row is not null;
