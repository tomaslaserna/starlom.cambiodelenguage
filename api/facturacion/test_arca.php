<?php
require_once __DIR__ . '/src/afip.php-master/src/Afip.php';

try {
    $afip = new Afip(array(
        'access_token' => 'btBIHuYIbA4oaajzqt4FzoX8TNcWlmEYInv8UonU6eenv6rjclvdL0XLZjeR15d6',
        'CUIT'         => 20466567575,
        'production'   => false,
        'cert'         => file_get_contents(__DIR__ . '/certificados/certificado_afip_test.pem'),
        'key'          => file_get_contents(__DIR__ . '/certificados/starlimkeytest.key'),
    ));

    $pto_vta  = 1;
    $cbt_tipo = 11;

    $ultimo    = $afip->ElectronicBilling->GetLastVoucher($pto_vta, $cbt_tipo);
    $siguiente = $ultimo + 1;

    $data = array(
        'CantReg'                 => 1,
        'PtoVta'                  => $pto_vta,
        'CbteTipo'                => $cbt_tipo,
        'Concepto'                => 1,
        'DocTipo'                 => 96,
        'DocNro'                  => 12345678,
        'CbteFch'                 => intval(date('Ymd')),
        'ImpTotal'                => 1250.00,
        'ImpTotConc'              => 0,
        'ImpNeto'                 => 1250.00,
        'ImpOpEx'                 => 0,
        'ImpIVA'                  => 0,
        'ImpTrib'                 => 0,
        'MonId'                   => 'PES',
        'MonCotiz'                => 1,
        'CbteDesde'               => $siguiente,
        'CbteHasta'               => $siguiente,
        'CondicionIVAReceptorId'  => 5,  // 5 = Consumidor Final
    );
    $res = $afip->ElectronicBilling->CreateNextVoucher($data);

    if (isset($res['CAE'])) {
        echo "Factura emitida exitosamente.<br>";
        echo "CAE: " . $res['CAE'] . "<br>";
        echo "Vencimiento CAE: " . $res['CAEFchVto'] . "<br>";
        echo "Número de comprobante: " . $siguiente;
    } else {
        echo "ARCA no devolvió CAE.";
        var_dump($res);
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}