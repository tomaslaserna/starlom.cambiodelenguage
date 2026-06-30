alter table public.clients
  add column if not exists external_code text;

create unique index if not exists clients_empresa_external_code_uidx
  on public.clients (empresa_id, external_code)
  where external_code is not null;
