alter table public.sales_internal_documents
  add column if not exists fiscal_point_of_sale integer,
  add column if not exists fiscal_receipt_type integer,
  add column if not exists fiscal_receipt_number integer;

create unique index if not exists sales_internal_documents_empresa_fiscal_receipt_unique_idx
  on public.sales_internal_documents (empresa_id, fiscal_point_of_sale, fiscal_receipt_type, fiscal_receipt_number)
  where fiscal = true
    and fiscal_status = 'aprobado'
    and fiscal_point_of_sale is not null
    and fiscal_receipt_type is not null
    and fiscal_receipt_number is not null
    and cae <> ''
    and cae <> 'manual';

comment on column public.sales_internal_documents.fiscal_point_of_sale is
  'Punto de venta fiscal autorizado por ARCA para notas de credito/debito emitidas sobre ventas.';

comment on column public.sales_internal_documents.fiscal_receipt_type is
  'Tipo de comprobante fiscal ARCA de la nota emitida.';

comment on column public.sales_internal_documents.fiscal_receipt_number is
  'Numero fiscal ARCA autorizado de la nota emitida.';
