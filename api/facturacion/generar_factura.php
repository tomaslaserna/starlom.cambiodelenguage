<?php
// Conector ARCA/AFIP WSFEv1. No ejecutar este archivo directamente; incluir
// emitirFacturaARCA() desde endpoints autenticados del backend.

require_once __DIR__ . '/src/afip.php-master/src/Afip.php';

function emitirFacturaARCA(
    $nro_doc,
    $monto_neto,
    $monto_iva,
    $monto_total,
    $tipo_cbte = 6,
    $tipo_doc = 96,
    $fecha = '',
    $cbte_asoc = null
) {
    $afip_env = function (string $key, string $default = ''): string {
        if (function_exists('_env')) return _env($key, $default);
        $value = getenv($key);
        return $value !== false ? trim((string)$value) : $default;
    };

    $token = $afip_env('AFIP_SDK_TOKEN');
    $cuit = (int)$afip_env('AFIP_CUIT');
    if ($token === '' || $cuit <= 0) {
        return [
            'success' => false,
            'error' => 'Configurar AFIP_SDK_TOKEN y AFIP_CUIT antes de emitir facturas ARCA.',
        ];
    }

    $afip_prod = strtolower($afip_env('AFIP_PRODUCTION', 'false')) === 'true';
    $pto_vta = max(1, (int)$afip_env('AFIP_PTO_VTA', '1'));

    $cert = str_replace('\n', "\n", $afip_env('AFIP_CERT'));
    $key = str_replace('\n', "\n", $afip_env('AFIP_KEY'));
    if ($cert === '') {
        $cert_path = $afip_env('AFIP_CERT_PATH', __DIR__ . '/certificados/certificado_afip_test.pem');
        $cert = (string)@file_get_contents($cert_path);
    }
    if ($key === '') {
        $key_path = $afip_env('AFIP_KEY_PATH', __DIR__ . '/certificados/starlimkeytest.key');
        $key = (string)@file_get_contents($key_path);
    }
    if ($cert === '' || $key === '') {
        return [
            'success' => false,
            'error' => 'Certificado ARCA no disponible: configurar AFIP_CERT/AFIP_KEY o AFIP_CERT_PATH/AFIP_KEY_PATH.',
        ];
    }

    try {
        $afip = new Afip([
            'access_token' => $token,
            'CUIT' => $cuit,
            'production' => $afip_prod,
            'cert' => $cert,
            'key' => $key,
        ]);

        $tz_arg = new DateTimeZone('America/Argentina/Buenos_Aires');
        $cbteFch = !empty($fecha)
            ? (int)(new DateTime((string)$fecha, $tz_arg))->format('Ymd')
            : (int)(new DateTime('now', $tz_arg))->format('Ymd');

        $tipo_cbte = (int)$tipo_cbte;
        $tipo_doc = (int)$tipo_doc;
        $monto_total = round((float)$monto_total, 2);
        $monto_neto = round((float)$monto_neto, 2);
        $monto_iva = round((float)$monto_iva, 2);

        // CondicionIVAReceptorId: 1 = Responsable Inscripto, 5 = Consumidor Final.
        $cond_iva_receptor = in_array($tipo_cbte, [1, 2, 3], true) ? 1 : 5;

        $data = [
            'CantReg' => 1,
            'PtoVta' => $pto_vta,
            'CbteTipo' => $tipo_cbte,
            'Concepto' => 1,
            'DocTipo' => $tipo_doc,
            'DocNro' => (int)preg_replace('/[^0-9]/', '', (string)$nro_doc),
            'CbteFch' => $cbteFch,
            'ImpTotal' => $monto_total,
            'ImpTotConc' => 0,
            'ImpNeto' => $monto_neto,
            'ImpOpEx' => 0,
            'ImpIVA' => $monto_iva,
            'ImpTrib' => 0,
            'MonId' => 'PES',
            'MonCotiz' => 1,
            'CondicionIVAReceptorId' => $cond_iva_receptor,
        ];

        if (in_array($tipo_cbte, [1, 2, 3], true)) {
            $base_imponible = round($monto_neto, 2);
            $importe_iva = round($monto_iva, 2);
        } else {
            $base_imponible = round($monto_total / 1.21, 2);
            $importe_iva = round($monto_total - $base_imponible, 2);
            $data['ImpNeto'] = $base_imponible;
            $data['ImpIVA'] = $importe_iva;
        }

        if ($base_imponible > 0) {
            $data['Iva'] = [[
                'Id' => 5,
                'BaseImp' => $base_imponible,
                'Importe' => $importe_iva,
            ]];
        }

        if (in_array($tipo_cbte, [2, 3, 7, 8], true)) {
            if (!empty($cbte_asoc)) {
                $data['CbteAsoc'] = [[
                    'Tipo' => (int)$cbte_asoc['tipo'],
                    'PtoVta' => (int)$cbte_asoc['pto_vta'],
                    'Nro' => (int)$cbte_asoc['nro'],
                ]];
            } else {
                $dt_per = !empty($fecha) ? new DateTime((string)$fecha, $tz_arg) : new DateTime('now', $tz_arg);
                $dt_fin = clone $dt_per;
                $dt_fin->modify('last day of this month');
                $data['PeriodoAsoc'] = [
                    'FchDesde' => $dt_per->format('Ym') . '01',
                    'FchHasta' => $dt_fin->format('Ymd'),
                ];
            }
        }

        $res = $afip->ElectronicBilling->CreateNextVoucher($data);
        if (isset($res['CAE'])) {
            return [
                'success' => true,
                'CAE' => $res['CAE'],
                'vencimiento' => $res['CAEFchVto'],
                'comprobante' => $res['voucher_number'],
                'pto_vta' => $pto_vta,
                'tipo_cbte' => $tipo_cbte,
            ];
        }

        return ['success' => false, 'error' => 'ARCA no devolvio un CAE.'];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}
