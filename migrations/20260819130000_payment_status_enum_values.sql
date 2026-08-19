-- payments.status es un enum `payment_status`. El rediseño de cobros (cuenta
-- corriente) usa estados nuevos que el enum no tenía, y las escrituras a esa
-- columna (registrar pendiente, anular, rechazar) fallan sin estos labels:
--   invalid input value for enum payment_status: "pendiente_aprobacion"
-- Se agregan de forma idempotente. `registrado` ya existe (lo usan los flujos
-- previos), no se toca.
--
-- Nota operativa: `ALTER TYPE ... ADD VALUE` no puede usarse en la misma
-- transacción en que se agrega. En el editor SQL de Supabase (autocommit por
-- statement) esto corre sin problema; ejecutar los tres statements y listo.
alter type public.payment_status add value if not exists 'pendiente_aprobacion';
alter type public.payment_status add value if not exists 'anulado';
alter type public.payment_status add value if not exists 'rechazado';
