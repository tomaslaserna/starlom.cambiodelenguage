create or replace function public.enforce_active_product_pricing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_code text;
begin
  if coalesce(new.active, false) then
    if coalesce(new.cost, 0) <= 0 then
      raise exception 'No se puede activar un producto sin costo positivo'
        using errcode = '23514';
    end if;

    normalized_code := left(
      regexp_replace(upper(coalesce(new.category_code, '')), '[^A-Z0-9]', '', 'g'),
      10
    );

    if normalized_code = '' then
      raise exception 'No se puede activar un producto sin categoría de margen'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.margenes m
      where m.empresa_id = new.empresa_id
        and m.codigo = normalized_code
    ) then
      raise exception 'La categoría % no tiene una regla de margen configurada', normalized_code
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.listas_precio lp
      where lp.empresa_id = new.empresa_id
        and lp.activa = 1
        and not exists (
          select 1
          from public.margenes_listas ml
          where ml.empresa_id = new.empresa_id
            and ml.lista_id = lp.id
            and ml.codigo = normalized_code
        )
    ) then
      raise exception 'La categoría % no tiene multiplicador en todas las listas activas', normalized_code
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_active_product_pricing() from public, anon, authenticated;

drop trigger if exists trg_enforce_active_product_pricing on public.products;

create trigger trg_enforce_active_product_pricing
before insert or update of active, cost, category_code, empresa_id
on public.products
for each row
execute function public.enforce_active_product_pricing();
