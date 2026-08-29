export type CompanyManualEntry = {
  id: string;
  title: string;
  area: string;
  keywords: string[];
  summary: string;
  steps: string[];
  checks: string[];
  href: string;
};

export const COMPANY_MANUAL: CompanyManualEntry[] = [
  {
    id: "orders",
    title: "Ciclo de pedidos, entrega y venta",
    area: "Operaciones",
    keywords: ["pedido", "cargar", "autorizar", "entregar", "remito", "venta"],
    summary: "Un pedido se carga, se autoriza y recién al marcarse como entregado integra el registro de ventas y la cuenta corriente.",
    steps: [
      "Ingresar en Operaciones > Pedidos y elegir Cargar pedido.",
      "Seleccionar cliente, productos, cantidades, precios, descuentos y comprobante sugerido.",
      "Autorizar el pedido desde el registro; la autorización no equivale a entrega.",
      "Marcarlo como entregado cuando la mercadería efectivamente salió.",
      "Verificar remito, venta, stock y cuenta corriente desde sus enlaces asociados.",
    ],
    checks: ["No marcar entregado antes de la salida real.", "El comprobante habitual del cliente es una sugerencia, no una prohibición fiscal."],
    href: "/orders",
  },
  {
    id: "sales-adjustments",
    title: "Devoluciones, agregados y trazabilidad",
    area: "Operaciones",
    keywords: ["devolucion", "nota credito", "nota debito", "agregado", "ajuste", "stock"],
    summary: "Una devolución o agregado debe vincularse a una venta entregada y deja trazabilidad comercial, de stock y cuenta corriente.",
    steps: [
      "Abrir la venta entregada en Registro de ventas.",
      "Registrar devolución para mercadería que vuelve o agregado para mercadería/cargos adicionales.",
      "Controlar cantidades y el vínculo con el remito original.",
      "Solicitar la nota fiscal correspondiente si el movimiento debe fiscalizarse.",
      "Verificar el ajuste neto en venta, stock, cuenta corriente y comprobantes asociados.",
    ],
    checks: ["No crear notas sin venta entregada de origen.", "La nota fiscal no debe duplicar el impacto operativo ya registrado."],
    href: "/sales",
  },
  {
    id: "fiscal",
    title: "Solicitud y autorización fiscal",
    area: "Fiscal",
    keywords: ["factura", "arca", "cae", "fiscal", "nota credito", "nota debito", "aprobar"],
    summary: "Las facturas y notas fiscales pasan por solicitud, autorización y validación de CAE antes de considerarse emitidas.",
    steps: [
      "Solicitar el comprobante fiscal desde la venta o nota asociada.",
      "Revisar receptor, razón social, CUIT, condición fiscal, punto de venta e importe.",
      "Autorizar desde Operaciones > Fiscal.",
      "Confirmar número completo, CAE, vencimiento y PDF.",
      "Si ARCA autorizó pero el último comprobante no coincide, conciliar antes de reemitir para evitar duplicados.",
    ],
    checks: ["Una factura emitida no demuestra el saldo actual a cobrar.", "Nunca reemitir a ciegas ante una respuesta fiscal ambigua."],
    href: "/billing",
  },
  {
    id: "collections",
    title: "Cuentas corrientes y cobranzas",
    area: "Administración",
    keywords: ["cobrar", "deuda", "saldo", "cuenta corriente", "pago", "recibo"],
    summary: "El saldo real surge de débitos operativos, ajustes y pagos registrados; no debe reconstruirse sólo sumando facturas.",
    steps: [
      "Abrir Cuentas corrientes y buscar al cliente.",
      "Revisar débitos vinculados a remitos, notas y créditos por pagos.",
      "Registrar únicamente pagos respaldados por un comprobante o confirmación real.",
      "Aplicar el cobro y emitir el recibo correspondiente.",
      "Confirmar el saldo corrido final.",
    ],
    checks: ["No duplicar pagos históricos.", "No crear saldos a favor si faltan ventas históricas en la migración sin antes conciliar."],
    href: "/payments/accounts",
  },
  {
    id: "purchases",
    title: "Recepción de compras a proveedores",
    area: "Compras",
    keywords: ["compra", "proveedor", "remito proveedor", "costo", "iva compras", "ingreso stock"],
    summary: "Registrar una compra ingresa stock, actualiza costos cuando corresponde, registra IVA y genera la obligación con el proveedor.",
    steps: [
      "Ingresar en Compras y elegir Nueva compra.",
      "Seleccionar proveedor, fecha y comprobante recibido.",
      "Agregar productos, cantidades y costo unitario sin IVA.",
      "Discriminar neto gravado e IVA y controlar el total del comprobante.",
      "Registrar y esperar la confirmación de cada etapa: compra, stock, costos y cuenta por pagar.",
    ],
    checks: ["Confirmar si la lista del proveedor incluye IVA antes de cargar costos.", "Un producto nuevo debe quedar identificado y con stock inicial respaldado por la compra."],
    href: "/purchases",
  },
  {
    id: "quotes",
    title: "Presupuestos y conversión a pedido",
    area: "Operaciones",
    keywords: ["presupuesto", "prospecto", "vigencia", "precio congelado", "confirmar presupuesto"],
    summary: "El presupuesto congela sus precios durante la vigencia y puede emitirse a un prospecto; al confirmarlo se vincula o crea el cliente.",
    steps: [
      "Crear el presupuesto para cliente existente o prospecto.",
      "Revisar lista, condición de IVA, descuentos, vigencia y totales congelados.",
      "Editar sin reemplazar precios históricos por los vigentes del catálogo.",
      "Al aceptar, vincular un cliente existente o completar el formulario de alta.",
      "Convertirlo en pedido conservando cantidades y precios aprobados.",
    ],
    checks: ["No recalcular automáticamente un presupuesto vigente.", "La aceptación no equivale a entrega ni facturación."],
    href: "/quotes",
  },
  {
    id: "crm",
    title: "CRM, leads y seguimiento comercial",
    area: "CRM",
    keywords: ["crm", "lead", "contactar", "recompra", "cliente perdido", "recordatorio"],
    summary: "Los leads se siguen con próximos contactos configurables; los clientes activos usan ritmo de recompra y las cobranzas usan vencimientos reales.",
    steps: [
      "Registrar o revisar el lead en CRM > Leads.",
      "Anotar el contacto y programar la próxima fecha según lo conversado.",
      "No reemplazar la fecha explícita del vendedor por una agenda automática.",
      "Al concretar la primera compra, convertir o vincular el lead con el cliente.",
      "Para clientes existentes, priorizar recompra atrasada, ventana esperada y cobros vencidos.",
    ],
    checks: ["No contactar repetidamente antes de la fecha programada.", "Separar leads no cerrados, recompra de clientes y cobranzas."],
    href: "/crm/leads",
  },
  {
    id: "pricing-stock",
    title: "Precios, catálogo y stock",
    area: "Datos",
    keywords: ["precio", "lista", "catalogo", "stock", "imagen", "costo"],
    summary: "El catálogo identifica el producto; el costo alimenta las listas y el stock surge de movimientos, no de una cifra manual aislada.",
    steps: [
      "Buscar el producto por nombre, código, categoría o proveedor.",
      "Revisar presentación, imagen, costo y listas de venta.",
      "Actualizar costos preferentemente desde una compra respaldada.",
      "Usar movimientos de stock para entradas, salidas o ajustes.",
      "Verificar que el producto correcto sea el usado en pedidos y presupuestos.",
    ],
    checks: ["No confundir costo sin IVA con precio final.", "No recomendar como disponible un producto sin revisar su existencia actual."],
    href: "/products",
  },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function searchCompanyManual(query: string, limit = 4) {
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 2);
  return COMPANY_MANUAL.map((entry) => {
    const title = normalize(entry.title);
    const content = normalize([entry.area, entry.summary, ...entry.keywords, ...entry.steps].join(" "));
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 5 : content.includes(term) ? 1 : 0), 0);
    return { entry, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "es"))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
