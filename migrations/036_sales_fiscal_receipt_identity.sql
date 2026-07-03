alter table public.sales
  add column if not exists fiscal_point_of_sale integer,
  add column if not exists fiscal_receipt_type integer,
  add column if not exists fiscal_receipt_number integer;

create unique index if not exists sales_empresa_fiscal_receipt_unique_idx
  on public.sales (empresa_id, fiscal_point_of_sale, fiscal_receipt_type, fiscal_receipt_number)
  where fiscal_status = 'aprobado'
    and fiscal_point_of_sale is not null
    and fiscal_receipt_type is not null
    and fiscal_receipt_number is not null
    and cae <> ''
    and cae <> 'manual';

comment on column public.sales.fiscal_point_of_sale is
  'Punto de venta fiscal autorizado por ARCA para el comprobante emitido.';

comment on column public.sales.fiscal_receipt_type is
  'Tipo de comprobante fiscal ARCA emitido, separado del comprobante operativo interno.';

comment on column public.sales.fiscal_receipt_number is
  'Numero fiscal ARCA autorizado, separado del numero interno/remito del pedido.';
