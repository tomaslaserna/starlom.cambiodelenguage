<?php
session_start();
include '../php/conexion_starlim_be.php';

$rango = $_SESSION['rango'] ?? "";
$usuario = $_SESSION['usuario'] ?? "";
$correo = $_SESSION['correo'] ?? "";

include '../php/conexion_starlim_be.php';

$id_producto = null;
$fila = null;

if (isset($_GET['id'])) {
    $id_producto = (int)($_GET['id'] ?? 0);
    $query = "SELECT *, costo AS precio, stock AS cantidad FROM productos WHERE id = $id_producto";
    $resultado = $conexion->query($query);
    $fila = $resultado->fetch_assoc();
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Producto</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/proceso_ventas.css?v=5">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<div class="menu-sol">
    <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" >
</div>
<div class="checkout-layout">

  <!-- PANEL IZQUIERDO: fijo -->
  <aside class="panel-producto">



    <?php if ($fila): ?>
        <div class="prod-imagen-wrap">
            <img class="producto-img" src="../<?php echo htmlspecialchars($fila['imagen']); ?>" alt="Producto">
        </div>
        <h2 class="prod-nombre"><?php echo htmlspecialchars($fila['nombre']); ?></h2>
        <p class="prod-precio" id="precio-total">
            $<?php echo number_format($fila['precio'], 2, ',', '.'); ?>
        </p>
        <div class="cantidad-control">
            <button type="button" id="btn-menos">−</button>
            <input type="number" id="cantidad-display" value="1" min="1" max="<?php echo $fila['cantidad']; ?>">
            <button type="button" id="btn-mas">+</button>
        </div>
        
        <!-- Campo oculto que manda la cantidad al backend -->
        <input type="hidden" name="cantidad" id="cantidad-input" value="1">
        <input type="hidden" id="stock-maximo" value="<?php echo intval($fila['cantidad']); ?>">
        <!-- Campo oculto con precio unitario para que JS pueda calcular -->
        <input type="hidden" id="precio-unitario" value="<?php echo $fila['precio']; ?>">
        <span class="prod-badge">En stock</span>
        <div class="prod-divider"></div>
        <p class="prod-descripcion"><?php echo htmlspecialchars($fila['descripcion'] ?? ''); ?></p>
    <?php endif; ?>
  </aside>

  <!-- PANEL DERECHO: scrolleable -->
  <main class="panel-formulario">
        <?php if ($fila): ?>
        <form id="form-pago" action="../php/procesar_pago.php" method="post" novalidate>
            <!-- Campos ocultos que el backend necesita -->
            <input type="hidden" name="id_producto" value="<?php echo $id_producto; ?>">
            <input type="hidden" name="monto" value="<?php echo $fila['precio']; ?>">

            <section class="form-section" id="seccion-datos">
                <h3 class="form-section-title">Datos de contacto</h3>

                <div class="campo">
                    <label for="correo">Correo electrónico *</label>
                    <input type="email" id="correo" name="correo"
                        value="<?php echo htmlspecialchars($correo); ?>"
                        placeholder="ejemplo@correo.com" required>
                    <span class="error-campo" id="err-correo">Ingresá un correo válido.</span>
                </div>

                <div class="campo campo-inline">
                    <div>
                        <label for="cp">Código postal *</label>
                        <input type="number" id="cp" name="cp" placeholder="5000" required>
                        <span class="error-campo" id="err-cp">Ingresá tu código postal.</span>
                    </div>
                    <a href="http://www.correoargentino.com.ar/formularios/cpa" target="_blank" rel="noopener">No sé mi CP</a>
                </div>

                <div class="campo">
                    <label for="dni_cliente">DNI *</label>
                    <input type="number" id="dni_cliente" name="dni_cliente" placeholder="12345678" required>
                    <span class="error-campo" id="err-dni">Ingresá tu DNI.</span>
                </div>
            </section>

            <section class="form-section" id="seccion-envio">
                <h3 class="form-section-title">Tipo de entrega</h3>

                <div class="tipo-entrega-grupo">
                    <label class="tipo-entrega-opcion">
                        <input type="radio" name="tipo_entrega" value="domicilio" id="radio-domicilio" checked>
                        <span>Envío a domicilio</span>
                    </label>
                    <label class="tipo-entrega-opcion">
                        <input type="radio" name="tipo_entrega" value="retiro" id="radio-retiro">
                        <span>Punto de retiro</span>
                    </label>
                </div>

                <!-- Panel: Envío a domicilio -->
                <div id="panel-domicilio" class="panel-entrega">
                    <fieldset>
                        <legend>Datos del destinatario</legend>

                        <div class="campo-fila">
                            <div class="campo">
                                <label>Nombre *</label>
                                <input type="text" name="dest_nombre" placeholder="Juan">
                            </div>
                            <div class="campo">
                                <label>Apellido *</label>
                                <input type="text" name="dest_apellido" placeholder="García">
                            </div>
                        </div>
                        <div class="campo">
                            <label>Teléfono *</label>
                            <input type="text" name="dest_telefono" placeholder="+54 9 351 000 0000">
                        </div>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Calle *</label>
                                <input type="text" name="dest_calle" placeholder="Av. Colón">
                            </div>
                            <div class="campo campo-numero">
                                <label>Número</label>
                                <input type="text" name="dest_numero" id="dest_numero" placeholder="1234">
                                <label class="check-inline">
                                    <input type="checkbox" id="sin-numero-dest"
                                        onchange="toggleNumero('dest_numero', this)"> Sin número
                                </label>
                            </div>
                        </div>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Departamento</label>
                                <input type="text" name="dest_depto" placeholder="Opcional">
                            </div>
                            <div class="campo">
                                <label>Barrio</label>
                                <input type="text" name="dest_barrio" placeholder="Opcional">
                            </div>
                        </div>
                    </fieldset>

                    <div class="campo check-fila">
                        <label class="check-inline">
                            <input type="checkbox" id="chk-factura-a"> Necesito factura A
                        </label>
                    </div>
                    <div id="panel-factura-a" class="panel-oculto">
                        <div class="campo-fila">
                            <div class="campo">
                                <label>CUIT *</label>
                                <input type="number" name="cuit" placeholder="20-12345678-9">
                            </div>
                            <div class="campo">
                                <label>Razón social *</label>
                                <input type="text" name="razon_social" placeholder="Mi Empresa S.A.">
                            </div>
                        </div>
                    </div>

                    <div class="campo check-fila">
                        <label class="check-inline">
                            <input type="checkbox" id="chk-dif-facturacion">
                            Mis datos de facturación son distintos a los de entrega
                        </label>
                    </div>
                    <div id="panel-dif-facturacion" class="panel-oculto">
                        <fieldset>
                            <legend>Datos de facturación</legend>
                            <div class="campo-fila">
                                <div class="campo">
                                    <label>Nombre</label>
                                    <input type="text" name="fact_nombre">
                                </div>
                                <div class="campo">
                                    <label>Apellido</label>
                                    <input type="text" name="fact_apellido">
                                </div>
                            </div>
                            <div class="campo">
                                <label>Teléfono</label>
                                <input type="text" name="fact_telefono">
                            </div>
                            <div class="campo-fila">
                                <div class="campo">
                                    <label>Calle</label>
                                    <input type="text" name="fact_calle">
                                </div>
                                <div class="campo campo-numero">
                                    <label>Número</label>
                                    <input type="text" name="fact_numero" id="fact_numero">
                                    <label class="check-inline">
                                        <input type="checkbox" id="sin-numero-fact"
                                            onchange="toggleNumero('fact_numero', this)"> Sin número
                                    </label>
                                </div>
                            </div>
                            <div class="campo-fila">
                                <div class="campo">
                                    <label>Ciudad</label>
                                    <input type="text" name="fact_ciudad">
                                </div>
                                <div class="campo">
                                    <label>CP</label>
                                    <input type="number" name="fact_cp">
                                </div>
                                <div class="campo">
                                    <label>Provincia</label>
                                    <select name="fact_provincia">
                                        <option value="cordoba">Córdoba</option>
                                    </select>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                </div>

                <!-- Panel: Punto de retiro -->
                <div id="panel-retiro" class="panel-entrega panel-oculto">
                    <fieldset>
                        <legend>Quien retira</legend>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Nombre *</label>
                                <input type="text" name="ret_nombre">
                            </div>
                            <div class="campo">
                                <label>Apellido *</label>
                                <input type="text" name="ret_apellido">
                            </div>
                        </div>
                        <div class="campo">
                            <label>Teléfono *</label>
                            <input type="text" name="ret_telefono">
                        </div>

                        <div class="campo check-fila">
                            <label class="check-inline">
                                <input type="checkbox" id="chk-retira-otro"> Otra persona va a retirar
                            </label>
                        </div>
                        <div id="panel-retira-otro" class="panel-oculto">
                            <fieldset>
                                <legend>Persona que retira</legend>
                                <div class="campo-fila">
                                    <div class="campo">
                                        <label>Nombre</label>
                                        <input type="text" name="otro_nombre">
                                    </div>
                                    <div class="campo">
                                        <label>Apellido</label>
                                        <input type="text" name="otro_apellido">
                                    </div>
                                </div>
                                <div class="campo">
                                    <label>Teléfono</label>
                                    <input type="text" name="otro_telefono" id="otro_telefono">
                                    <label class="check-inline">
                                        <input type="checkbox" onchange="toggleTel('otro_telefono', this)"> Sin teléfono
                                    </label>
                                </div>
                            </fieldset>
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>Dirección del punto de retiro</legend>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Calle</label>
                                <input type="text" name="ret_calle">
                            </div>
                            <div class="campo">
                                <label>Número</label>
                                <input type="number" name="ret_numero">
                            </div>
                        </div>
                        <div class="campo-fila-3">
                            <div class="campo">
                                <label>Ciudad</label>
                                <input type="text" name="ret_ciudad">
                            </div>
                            <div class="campo">
                                <label>CP</label>
                                <input type="number" name="ret_cp">
                            </div>
                            <div class="campo">
                                <label>Provincia</label>
                                <select name="ret_provincia">
                                    <option value="cordoba">Córdoba</option>
                                </select>
                            </div>
                        </div>
                    </fieldset>
                </div>
                <button type="button" class="btn-continuar" id="btn-continuar">Continuar</button>
            </section>



            <section id="seccion-pago" class="panel-oculto">
                <fieldset>
                    <div class="tipo-pago-grupo">
                        <label class="tipo-pago-opcion">
                            <input type="radio" name="tipo_pago" value="tarjeta" id="radio-tarjeta">
                            <span>Tarjeta crédito/débito</span>
                        </label>
                        <label class="tipo-pago-opcion">
                            <input type="radio" name="tipo_pago" value="transferencia" id="radio-transferencia">
                            <span>Transferencia</span>
                        </label>
                        <label class="tipo-pago-opcion">
                            <input type="radio" name="tipo_pago" value="qr" id="radio-qr">
                            <span>QR</span>
                        </label>
                        <label class="tipo-pago-opcion">
                            <input type="radio" name="tipo_pago" value="efectivo" id="radio-efectivo">
                            <span>Efectivo (al momento de la entrega)</span>
                        </label>
                    </div>

                    <!-- Panel tarjeta -->
                    <div id="panel-tarjeta" class="panel-pago panel-oculto">
                        <legend>Datos de la tarjeta</legend>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Número de tarjeta *</label>
                                <input type="text" name="num_tarjeta" placeholder="1234 5678 9012 3456"
                                    maxlength="19" id="input-num-tarjeta">
                            </div>
                            <div class="campo">
                                <label>Titular de la tarjeta *</label>
                                <input type="text" name="titular_tarjeta" placeholder="Nombre como figura en la tarjeta">
                            </div>
                        </div>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Vencimiento *</label>
                                <input type="text" name="venc_tarjeta" placeholder="MM/AA" maxlength="5">
                            </div>
                            <div class="campo">
                                <label>CVV *</label>
                                <input type="number" name="cvv_tarjeta" placeholder="123" maxlength="4">
                            </div>
                        </div>
                        <div class="campo">
                            <label>Cuotas *</label>
                            <select name="cuotas">
                                <option value="1">1x $<?php echo number_format($fila['precio'], 2, ',', '.'); ?></option>
                            </select>
                        </div>
                        <div class="campo-fila">
                            <div class="campo">
                                <label>Tipo de documento *</label>
                                <select name="tipo_doc_tarjeta" id="select-tipo-doc">
                                    <option value="DNI">DNI</option>
                                    <option value="CUIT">CUIT</option>
                                </select>
                            </div>
                            <div class="campo">
                                <label>Número de <span id="label-tipo-doc">DNI</span> *</label>
                                <input type="text" name="nro_doc_tarjeta" id="input-nro-doc"
                                    placeholder="Número de DNI">
                            </div>
                        </div>
                        <div class="campo">
                            <label>Teléfono *</label>
                            <input type="text" name="telefono_tarjeta" placeholder="+54 9 351 000 0000">
                        </div>
                        <div class="campo">
                            <label>Tarjetas aceptadas</label>
                            <p style="font-size:13px; opacity:.6;">
                                <!-- Acá van las imágenes de las tarjetas cuando las tengas -->
                                Visa, Mastercard, Cabal, Naranja...
                            </p>
                        </div>
                    </div>

                    <!-- Panel transferencia -->
                    <div id="panel-transferencia" class="panel-pago panel-oculto">
                        <legend>Transferencia bancaria</legend>
                        <p>Después de confirmar la compra te enviaremos un mail con el alias para transferir.</p>
                    </div>

                    <!-- Panel QR -->
                    <div id="panel-qr" class="panel-pago panel-oculto">
                        <legend>Pago con QR</legend>
                        <p style="font-size:13px; margin-bottom:1rem;">
                            Escaneá el código con tu billetera virtual (Mercado Pago, Ualá, etc.)
                        </p>
                        <div id="qr-container"></div>
                    </div>

                    <!-- Panel efectivo -->
                    <div id="panel-efectivo" class="panel-pago panel-oculto">
                        <legend>Efectivo</legend>
                        <p>Abonás al momento de recibir el producto. El repartidor llevará cambio.</p>
                    </div>

                </fieldset>
                <button type="submit" class="btn-pagar">Pagar</button>
            </section>
        </form>
        <?php endif; ?>
    </main>
<script src="../js/global.js"></script>
<script src="../js/proceso_ventas.js?v=4"></script>
</body>
</html>