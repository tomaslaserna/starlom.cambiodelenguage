# Facturacion ARCA con aprobacion Admin

## Flujo operativo

1. Un usuario de staff abre una venta entregada desde Ventas > Registro > Comprobantes.
2. Si la venta no tiene CAE, puede presionar "Solicitar factura ARCA".
3. El backend crea un `billing_document` en estado `ready_for_validation` o `validation_failed`.
4. La solicitud aparece en Administracion > Facturacion > Cola de aprobacion ARCA.
5. Solo un usuario con rango `Admin` puede presionar "Aprobar y emitir".
6. Al aprobar, el backend solicita CAE por ARCA/AFIP WSFEv1.
7. Si ARCA autoriza, se actualizan `billing_document`, `fiscal_authorization` y la fila de `ventas` con `cae`, `tipo_cbte`, `nro_comprobante`, `monto_neto`, `monto_iva` y `seguimiento = 'facturada'`.
8. La factura queda visible con `api/php/generar_pdf_factura.php?id_venta=...&view=1`.

## Permisos

- Staff: puede generar solicitudes fiscales desde ventas entregadas.
- Admin: puede aprobar y emitir CAE.
- Clientes/no staff: no pueden crear solicitudes fiscales.

## Criterio fiscal inicial

- Factura A: cliente con CUIT/CUIL y condicion IVA Responsable Inscripto.
- Factura B: resto de los clientes.
- Si la venta no trae neto/IVA, se discrimina IVA 21% desde el total bruto.

## Variables requeridas en Vercel

- `AFIP_PRODUCTION`: `false` para homologacion, `true` para produccion.
- `AFIP_CUIT`
- `AFIP_PTO_VTA`
- `AFIP_SDK_TOKEN`
- `AFIP_CERT` y `AFIP_KEY` para produccion, o `AFIP_CERT_PATH` y `AFIP_KEY_PATH` si se usan archivos.

El despliegue actual queda preparado con credenciales de homologacion. Para emitir comprobantes reales hay que cargar certificado, clave, token y CUIT productivos en Vercel y redeployar con `AFIP_PRODUCTION=true`.
