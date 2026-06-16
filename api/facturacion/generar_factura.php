<?php
// generar_factura.php

require_once __DIR__ . '/src/afip.php-master/src/Afip.php';

function emitirFacturaARCA($nro_doc, $monto_neto, $monto_iva, $monto_total, $tipo_cbte = 6, $tipo_doc = 96, $fecha = '', $cbte_asoc = null) {
    // CondicionIVAReceptorId: 1 = Resp. Inscripto, 5 = Consumidor Final
    // Tipos A (1=Fac.A, 2=ND-A, 3=NC-A): receptor Resp. Inscripto; Tipos B: Cons. Final
    $cond_iva_receptor = in_array($tipo_cbte, [1, 2, 3]) ? 1 : 5;

    // Config vía variables de entorno (fallback: valores de homologación).
    // Para producción: AFIP_PRODUCTION=true, AFIP_CUIT, AFIP_SDK_TOKEN y el
    // certificado real vía AFIP_CERT/AFIP_KEY (contenido PEM en la env var,
    // los saltos de línea pueden ir como \n literales) — nunca commitearlo.
    $afip_env = function (string $k, string $d = ''): string {
        if (function_exists('_env')) return _env($k, $d);
        $v = getenv($k);
        return $v !== false ? trim($v) : $d;
    };

    $afip_prod = strtolower($afip_env('AFIP_PRODUCTION', 'false')) === 'true';

    // Cert/key: primero contenido por env, después archivo en disco
    $cert = str_replace('\n', "\n", $afip_env('AFIP_CERT'));
    $key  = str_replace('\n', "\n", $afip_env('AFIP_KEY'));
    if ($cert === '') {
        $cert_path = $afip_env('AFIP_CERT_PATH', __DIR__ . '/certificados/certificado_afip_test.pem');
        $cert = (string) @file_get_contents($cert_path);
    }
    if ($key === '') {
        $key_path = $afip_env('AFIP_KEY_PATH', __DIR__ . '/certificados/starlimkeytest.key');
        $key = (string) @file_get_contents($key_path);
    }
    if ($cert === '' || $key === '') {
        return array('success' => false, 'error' =>
            'Certificado AFIP no disponible en el servidor: configurar AFIP_CERT/AFIP_KEY ' .
            'o incluir los archivos en api/facturacion/certificados/.');
    }

    try {
        $afip = new Afip(array(
            'access_token' => $afip_env('AFIP_SDK_TOKEN', 'btBIHuYIbA4oaajzqt4FzoX8TNcWlmEYInv8UonU6eenv6rjclvdL0XLZjeR15d6'),
            'CUIT'         => (int) $afip_env('AFIP_CUIT', '20466567575'),
            'production'   => $afip_prod,
            'cert'         => $cert,
            'key'          => $key,
        ));

        $pto_vta = (int) $afip_env('AFIP_PTO_VTA', '1');

        // Usar la fecha del formulario si fue enviada; si no, tomar la fecha
        // actual en timezone Argentina para evitar desfase UTC al cierre de mes.
        $tz_arg  = new DateTimeZone('America/Argentina/Buenos_Aires');
        if (!empty($fecha)) {
            // $fecha llega como 'Y-m-d' desde el form → convertir a Ymd para AFIP
            $cbteFch = intval((new DateTime($fecha))->format('Ymd'));
        } else {
            $cbteFch = intval((new DateTime('now', $tz_arg))->format('Ymd'));
        }

        $data = array(
            'CantReg'                => 1,
            'PtoVta'                 => $pto_vta,
            'CbteTipo'               => $tipo_cbte,
            'Concepto'               => 1,
            'DocTipo'                => $tipo_doc,
            'DocNro'                 => intval(preg_replace('/[^0-9]/', '', $nro_doc)),
            'CbteFch'                => $cbteFch,
            'ImpTotal'               => floatval($monto_total),
            'ImpTotConc'             => 0,
            'ImpNeto'                => floatval($monto_neto),
            'ImpOpEx'                => 0,
            'ImpIVA'                 => floatval($monto_iva),
            'ImpTrib'                => 0,
            'MonId'                  => 'PES',
            'MonCotiz'               => 1,
            'CondicionIVAReceptorId' => $cond_iva_receptor,
        );

        // AFIP error 10070: el objeto Iva es obligatorio cuando ImpNeto > 0.
        // Factura A: el frontend discrimina IVA (monto_neto + monto_iva = monto_total).
        // Factura B: el frontend envía IVA=0 y neto=total (precio con IVA incluido),
        //            así que hay que discriminar aquí antes de enviar a AFIP.
        // Tipos A (Fac A, NC-A, ND-A): IVA discriminado; Tipos B: IVA incluido en total
        if (in_array($tipo_cbte, [1, 2, 3])) {
            $base_imponible = round(floatval($monto_neto), 2);
            $importe_iva    = round(floatval($monto_iva), 2);
        } else {
            $base_imponible = round(floatval($monto_total) / 1.21, 2);
            $importe_iva    = round(floatval($monto_total) - $base_imponible, 2);
            $data['ImpNeto'] = $base_imponible;
            $data['ImpIVA']  = $importe_iva;
        }

        if ($base_imponible > 0) {
            $data['Iva'] = array(
                array(
                    'Id'      => 5,    // 5 = 21%
                    'BaseImp' => $base_imponible,
                    'Importe' => $importe_iva,
                )
            );
        }

        // NC/ND (tipos 2, 3, 7, 8) requieren CbteAsoc o PeriodoAsoc — error AFIP 10197
        if (in_array($tipo_cbte, [2, 3, 7, 8])) {
            if (!empty($cbte_asoc)) {
                // Referenciar la factura original
                $data['CbteAsoc'] = [
                    [
                        'Tipo'   => intval($cbte_asoc['tipo']),
                        'PtoVta' => intval($cbte_asoc['pto_vta']),
                        'Nro'    => intval($cbte_asoc['nro']),
                    ]
                ];
            } else {
                // Sin referencia específica: usar el período completo del mes de la factura
                $tz_arg2 = new DateTimeZone('America/Argentina/Buenos_Aires');
                $dtPer   = !empty($fecha)
                    ? new DateTime($fecha, $tz_arg2)
                    : new DateTime('now', $tz_arg2);
                $dtFin   = clone $dtPer;
                $dtFin->modify('last day of this month');
                $data['PeriodoAsoc'] = [
                    'FchDesde' => $dtPer->format('Y') . $dtPer->format('m') . '01',
                    'FchHasta' => $dtFin->format('Ymd'),
                ];
            }
        }

        $res = $afip->ElectronicBilling->CreateNextVoucher($data);

        if (isset($res['CAE'])) {
            return array(
                'success'     => true,
                'CAE'         => $res['CAE'],
                'vencimiento' => $res['CAEFchVto'],
                'comprobante' => $res['voucher_number'],
            );
        } else {
            return array('success' => false, 'error' => 'ARCA no devolvió un CAE.');
        }

    } catch (Exception $e) {
        return array('success' => false, 'error' => $e->getMessage());
    }
}