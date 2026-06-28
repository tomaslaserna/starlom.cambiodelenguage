import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { getPurchase } from "@/lib/purchases";
import { getQuote } from "@/lib/quotes";
import {
  createPdfFile,
  pdfDate,
  pdfMoney,
  pdfNumber,
  safeFilename,
  type PdfTableCell,
} from "@/lib/pdf/renderer";

type QuoteProduct = {
  id?: number;
  name?: string;
  nombre?: string;
  quantity?: number;
  cantidad?: number;
  unitPrice?: number;
  precio_unit?: number;
  discount?: number;
  bonif?: number;
  subtotal?: number;
};

type AccountType = "cliente" | "proveedor";

function asQuoteProducts(value: unknown): QuoteProduct[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QuoteProduct => Boolean(item) && typeof item === "object");
}

function parseAccountType(value: string | null): AccountType {
  return value === "proveedor" ? "proveedor" : "cliente";
}

function dateRangeLabel(from: string, to: string) {
  if (!from && !to) return "Completo";
  return `${from ? pdfDate(from) : "inicio"} a ${to ? pdfDate(to) : "hoy"}`;
}

export async function buildQuotePdf(companyId: number, quoteId: string) {
  const quote = await getQuote(companyId, quoteId);
  const products = asQuoteProducts(quote.products);
  const filename = `presupuesto_${quote.id}.pdf`;

  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: "Presupuesto",
      code: "P",
      number: `P-${String(quote.id).padStart(6, "0")}`,
      date: pdfDate(quote.issueDate),
      extra: [`Validez hasta ${pdfDate(quote.expirationDate)}`],
    });

    pdf.section("Presupuestado a");
    pdf.title(quote.customer.businessName || quote.customer.name || "Sin cliente", 12);
    pdf.muted(
      [
        quote.customer.address,
        quote.customer.taxId ? `CUIT ${quote.customer.taxId}` : "",
        quote.customer.vatCondition,
        quote.customer.phone,
      ]
        .filter(Boolean)
        .join(" - ") || "-",
    );
    pdf.doc.y += 14;

    pdf.table(
      [
        { label: "Cant.", width: 52 },
        { label: "Descripcion", width: 250 },
        { label: "P. unit.", width: 86, align: "right" },
        { label: "Bonif.", width: 58, align: "right" },
        { label: "Importe", width: 65, align: "right" },
      ],
      products.map((product) => {
        const quantity = Number(product.quantity ?? product.cantidad ?? 1);
        const unitPrice = Number(product.unitPrice ?? product.precio_unit ?? 0);
        const discount = Number(product.discount ?? product.bonif ?? 0);
        const subtotal = Number(product.subtotal ?? unitPrice * quantity * (1 - discount / 100));
        return [
          pdfNumber(quantity),
          product.name ?? product.nombre ?? "-",
          pdfMoney(unitPrice),
          discount > 0 ? `${pdfNumber(discount, 1)}%` : "-",
          pdfMoney(subtotal),
        ];
      }),
    );

    const totals: [string, string][] = [
      ["Subtotal neto", pdfMoney(quote.netAmount)],
      ["Descuento", quote.discountAmount > 0 ? `-${pdfMoney(quote.discountAmount)}` : pdfMoney(0)],
      ["Base imponible", pdfMoney(quote.subtotal)],
    ];
    if (quote.includeVat) totals.push(["IVA 21%", pdfMoney(quote.vatAmount)]);
    pdf.totals(totals, "Total", pdfMoney(quote.total));
    pdf.note(
      "Precios expresados en pesos argentinos. Presupuesto valido hasta la fecha indicada, sujeto a disponibilidad de stock y confirmacion comercial.",
    );
    pdf.signatures("Por Starlim S.A.S.", "Conformidad del cliente");
  });
}

export async function buildDeliveryPdf(companyId: number, deliveryId: number, includePrices: boolean) {
  const header = await queryWithCompanyContext<{
    id: number;
    id_venta: number | null;
    nro_remito: number;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    condicion_pago: string;
    monto: string;
    vendedor: string;
    provincia: string;
    sucursal_cliente: string;
    deposito: string;
    observacion: string;
    domicilio: string;
    ciudad: string;
    cliente_provincia: string;
    tipo_id: string;
    nro_id: string;
    vendedor_cliente: string;
    observacion_cliente: string;
  }>(
    companyId,
    `
      SELECT r.id, r.id_venta, r.nro_remito, r.nombre_cliente, r.dni_cliente,
             r.fecha::text, COALESCE(r.condicion_pago, '') AS condicion_pago,
             COALESCE(r.monto, 0)::text AS monto, COALESCE(r.vendedor, '') AS vendedor,
             COALESCE(r.provincia, '') AS provincia,
             COALESCE(r.sucursal_cliente, '') AS sucursal_cliente,
             COALESCE(r.deposito, '') AS deposito,
             COALESCE(r.observacion, '') AS observacion,
             COALESCE(c.domicilio, '') AS domicilio,
             COALESCE(c.ciudad, '') AS ciudad,
             COALESCE(c.provincia, '') AS cliente_provincia,
             COALESCE(c.tipo_id, '') AS tipo_id,
             COALESCE(c.nro_id, r.dni_cliente, '') AS nro_id,
             COALESCE(c.vendedor_cl, '') AS vendedor_cliente,
             COALESCE(c.observacion, '') AS observacion_cliente
      FROM remitos r
      LEFT JOIN clientes c ON c.empresa_id = r.empresa_id
        AND regexp_replace(c.nro_id, '[^0-9]', '', 'g') = regexp_replace(r.dni_cliente, '[^0-9]', '', 'g')
      WHERE r.id = $1 AND r.empresa_id = $2
      LIMIT 1
    `,
    [deliveryId, companyId],
  );
  const remito = header.rows[0];
  if (!remito) throw new ApiError(404, "Remito no encontrado");

  const detail = await queryWithCompanyContext<{
    id_producto: number;
    nombre: string;
    cantidad: number;
    precio_unit: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT d.id_producto, COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
             d.cantidad, COALESCE(d.precio_unit, 0)::text AS precio_unit,
             COALESCE(d.subtotal, 0)::text AS subtotal
      FROM detalle_remitos d
      LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
      WHERE d.id_remito = $1 AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [deliveryId, companyId],
  );

  const number = String(remito.nro_remito).padStart(8, "0");
  return createPdfFile(`${includePrices ? "remito_con_precios" : "remito"}_${number}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Remito",
      code: "R",
      number,
      date: pdfDate(remito.fecha),
      extra: [includePrices ? "Documento valorizado" : "Control de mercaderia", remito.deposito ? `Deposito: ${remito.deposito}` : ""].filter(Boolean),
    });

    pdf.section("Destinatario");
    pdf.title(remito.nombre_cliente || "Sin cliente", 11);
    pdf.muted(
      [
        remito.domicilio,
        [remito.ciudad, remito.cliente_provincia].filter(Boolean).join(", "),
        `${remito.tipo_id || "DNI/CUIT"}: ${remito.nro_id || remito.dni_cliente}`,
      ]
        .filter(Boolean)
        .join(" - "),
    );
    const infoY = pdf.y + 16;
    pdf.keyValue("Cond. vta.", remito.condicion_pago || "-", 42, infoY, 74, 165);
    pdf.keyValue("Vendedor", remito.vendedor || remito.vendedor_cliente || "-", 314, infoY, 64, 150);
    pdf.keyValue("Provincia", remito.provincia || "-", 42, infoY + 18, 74, 165);
    pdf.keyValue("Sucursal", remito.sucursal_cliente || "-", 314, infoY + 18, 64, 150);
    pdf.setY(infoY + 42);

    const columns = includePrices
      ? [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 70 },
          { label: "Descripcion", width: 218 },
          { label: "P. unit.", width: 84, align: "right" as const },
          { label: "Importe", width: 85, align: "right" as const },
        ]
      : [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 78 },
          { label: "Descripcion", width: 319 },
          { label: "Control", width: 60, align: "center" as const },
        ];
    const totalUnits = detail.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
    const totalAmount = detail.rows.reduce((sum, row) => sum + Number(row.subtotal), 0);
    pdf.table(
      columns,
      detail.rows.map((row) =>
        includePrices
          ? [pdfNumber(row.cantidad), row.id_producto, row.nombre, pdfMoney(Number(row.precio_unit)), pdfMoney(Number(row.subtotal))]
          : [pdfNumber(row.cantidad), row.id_producto, row.nombre, "[ ]"],
      ),
    );
    pdf.totals([["Total de unidades", pdfNumber(totalUnits)]], includePrices ? "Total" : "Control", includePrices ? pdfMoney(totalAmount) : "");
    pdf.note(remito.observacion || remito.observacion_cliente || "Verificar cantidades y estado de la mercaderia al momento de la recepcion.");
    pdf.signatures("Preparo / despacho", "Controlo / recibio");
  });
}

export async function buildAccountStatementPdf(companyId: number, input: {
  type: string | null;
  name: string;
  from: string;
  to: string;
}) {
  const type = parseAccountType(input.type);
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Nombre requerido");
  const params: unknown[] = [companyId, name, type];
  const filters = ["empresa_id = $1", "entidad_nombre = $2", "tipo = $3"];
  if (input.from) {
    params.push(input.from);
    filters.push(`fecha >= $${params.length}`);
  }
  if (input.to) {
    params.push(input.to);
    filters.push(`fecha <= $${params.length}`);
  }

  const previous = input.from
    ? await queryWithCompanyContext<{ balance: string }>(
        companyId,
        "SELECT COALESCE(SUM(haber - debe), 0)::text AS balance FROM cuentas_corrientes WHERE empresa_id = $1 AND entidad_nombre = $2 AND tipo = $3 AND fecha < $4",
        [companyId, name, type, input.from],
      )
    : { rows: [{ balance: "0" }] };

  const movements = await queryWithCompanyContext<{
    descripcion: string;
    debe: string;
    haber: string;
    fecha: string | null;
  }>(
    companyId,
    `
      SELECT descripcion, debe::text, haber::text, fecha::text
      FROM cuentas_corrientes
      WHERE ${filters.join(" AND ")}
      ORDER BY fecha ASC NULLS LAST, id ASC
    `,
    params,
  );

  const filename = `cuenta_corriente_${safeFilename(name) || "entidad"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: "Cuenta corriente",
      code: "CC",
      number: `CC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
      date: pdfDate(new Date().toISOString()),
      extra: [`Tipo: ${type === "cliente" ? "Cliente" : "Proveedor"}`, `Periodo: ${dateRangeLabel(input.from, input.to)}`],
    });
    pdf.section(type === "cliente" ? "Cliente" : "Proveedor");
    pdf.title(name, 12);
    pdf.muted(`Periodo: ${dateRangeLabel(input.from, input.to)}`);
    pdf.doc.y += 14;

    let balance = Number(previous.rows[0]?.balance ?? 0);
    const totalDebit = movements.rows.reduce((sum, row) => sum + Number(row.debe), 0);
    const totalCredit = movements.rows.reduce((sum, row) => sum + Number(row.haber), 0);
    const rows: PdfTableCell[][] = [];
    if (input.from && Math.abs(balance) > 0.0001) {
      rows.push([pdfDate(input.from), "Saldo anterior", "-", "-", pdfMoney(balance)]);
    }
    for (const movement of movements.rows) {
      const debit = Number(movement.debe);
      const credit = Number(movement.haber);
      balance += credit - debit;
      rows.push([
        pdfDate(movement.fecha),
        movement.descripcion || "Movimiento de cuenta corriente",
        debit > 0 ? pdfMoney(debit) : "-",
        credit > 0 ? pdfMoney(credit) : "-",
        pdfMoney(balance),
      ]);
    }
    pdf.table(
      [
        { label: "Fecha", width: 70, align: "center" },
        { label: "Concepto", width: 241 },
        { label: "Debe", width: 68, align: "right" },
        { label: "Haber", width: 68, align: "right" },
        { label: "Saldo", width: 64, align: "right" },
      ],
      rows,
    );
    pdf.totals(
      [
        ["Saldo anterior", pdfMoney(Number(previous.rows[0]?.balance ?? 0))],
        ["Total debe", pdfMoney(totalDebit)],
        ["Total haber", pdfMoney(totalCredit)],
      ],
      Math.abs(balance) <= 0.0001 ? "Cuenta saldada" : balance < 0 ? "Saldo pendiente" : "Saldo a favor",
      pdfMoney(balance),
    );
    pdf.note("Este estado refleja los movimientos registrados en Starlim para la entidad y el periodo indicados.");
  });
}

export async function buildPaymentRecordPdf(companyId: number, paymentId: number) {
  const recordResult = await queryWithCompanyContext<{
    id: number;
    tipo: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    comprobante_nombre: string;
    notas: string;
    id_origen: number | null;
    tipo_origen: string;
    created_at: string;
  }>(
    companyId,
    `
      SELECT id, tipo, entidad_nombre, concepto, monto::text, fecha::text,
             comprobante_nombre, notas, id_origen, tipo_origen, created_at::text
      FROM pagos_registro
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [paymentId, companyId],
  );
  const record = recordResult.rows[0];
  if (!record) throw new ApiError(404, "Registro no encontrado");

  const isCollection = record.tipo === "cobro";
  const filename = `registro_pago_${paymentId}.pdf`;
  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: isCollection ? "Recibo de pago" : "Comprobante de pago",
      code: isCollection ? "RP" : "PG",
      number: `${isCollection ? "RP" : "PG"}-${String(paymentId).padStart(6, "0")}`,
      date: pdfDate(record.fecha || record.created_at),
      extra: [isCollection ? "Cobro de cliente" : "Pago a proveedor"],
    });
    pdf.section(isCollection ? "Recibimos de" : "Pagamos a");
    pdf.title(record.entidad_nombre || "-", 12);
    pdf.infoBox(isCollection ? "Importe recibido" : "Importe pagado", [
      record.concepto || (isCollection ? "Cobro aprobado" : "Pago registrado"),
      pdfMoney(Number(record.monto)),
    ]);
    pdf.section("Medio de pago");
    pdf.keyValue("Origen", record.tipo_origen || "-", 42, pdf.y + 2, 70, 160);
    pdf.keyValue("Registro", String(record.id), 314, pdf.y + 2, 70, 130);
    pdf.setY(pdf.y + 34);
    pdf.table(
      [
        { label: "Comprobante", width: 210 },
        { label: "Fecha", width: 90, align: "center" },
        { label: "Importe", width: 105, align: "right" },
        { label: "Aplicado", width: 106, align: "right" },
      ],
      [[record.concepto || `Registro #${record.id}`, pdfDate(record.fecha), pdfMoney(Number(record.monto)), pdfMoney(Number(record.monto))]],
    );
    if (record.notas || record.comprobante_nombre) {
      pdf.note([record.notas, record.comprobante_nombre ? "Comprobante adjunto: si" : ""].filter(Boolean).join(" "));
    }
    pdf.signatures(isCollection ? "Recibi conforme - Starlim" : "Autorizo pago - Starlim", "Aclaracion y firma");
  });
}

export async function buildPurchaseOrderPdf(companyId: number, purchaseId: number) {
  const purchase = await getPurchase(companyId, purchaseId);
  return createPdfFile(`orden_compra_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Orden de compra",
      code: "OC",
      number: `OC-${String(purchase.id).padStart(8, "0")}`,
      date: pdfDate(purchase.date),
      extra: [`Estado: ${purchase.status}`, `Tipo: ${purchase.type}`],
    });
    pdf.section("Proveedor");
    pdf.title(purchase.supplierName || `Compra #${purchase.id}`, 12);
    pdf.muted(purchase.description || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 72 },
        { label: "Descripcion", width: 260 },
        { label: "Cant.", width: 64, align: "center" },
        { label: "Costo ref.", width: 115, align: "right" },
      ],
      purchase.items.map((item) => [item.productId, item.name, pdfNumber(item.quantity), "-"]),
    );
    pdf.totals([["Items", String(purchase.items.length)]], "Total", pdfMoney(purchase.total));
    pdf.note("Orden emitida desde Starlim. Verificar cantidades, condiciones comerciales y recepcion de mercaderia.");
    pdf.signatures("Autorizo compra - Starlim", "Proveedor / recepcion");
  });
}

export async function buildPurchaseReturnRequestPdf(companyId: number, purchaseId: number, reason: string) {
  const purchase = await getPurchase(companyId, purchaseId);
  return createPdfFile(`solicitud_devolucion_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Solicitud de devolucion",
      code: "SD",
      number: `SD-${String(purchase.id).padStart(8, "0")}`,
      date: pdfDate(new Date().toISOString()),
      extra: [`Compra: #${purchase.id}`, `Estado: ${purchase.status}`],
    });
    pdf.section("Proveedor");
    pdf.title(purchase.supplierName || `Compra #${purchase.id}`, 12);
    pdf.muted(purchase.description || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 72 },
        { label: "Descripcion", width: 300 },
        { label: "Cant.", width: 64, align: "center" },
        { label: "Motivo", width: 75 },
      ],
      purchase.items.map((item) => [item.productId, item.name, pdfNumber(item.quantity), reason || "A revisar"]),
    );
    pdf.note(reason || "Solicitud operativa de devolucion. Confirmar productos y cantidades antes del despacho.");
    pdf.signatures("Solicita Starlim", "Recibe proveedor");
  });
}

export async function buildPriceListPdf(companyId: number, list: number) {
  const cols = {
    0: { expr: "precio_0", label: "Lista 0" },
    1: { expr: "precio_1", label: "Lista 1" },
    2: { expr: "precio_2", label: "Lista 2" },
    3: { expr: "precio_3", label: "Lista 3" },
    4: { expr: "ROUND(precio_3 * 1.10, 2)", label: "Lista 4 (+10%)" },
    5: { expr: "precio_minorista", label: "Minorista" },
  } as const;
  const selected = cols[(list in cols ? list : 0) as keyof typeof cols];
  const result = await queryWithCompanyContext<{ nombre: string; precio: string }>(
    companyId,
    `
      SELECT nombre, ${selected.expr} AS precio
      FROM vista_precios
      WHERE empresa_id = $1 AND precio_1 IS NOT NULL AND ${selected.expr} > 0
      ORDER BY nombre ASC
    `,
    [companyId],
  );

  return createPdfFile(`lista_precios_${safeFilename(selected.label)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Lista de precios",
      code: "LP",
      number: selected.label,
      date: pdfDate(new Date().toISOString()),
      extra: [`Productos: ${result.rows.length}`],
    });
    pdf.table(
      [
        { label: "Producto", width: 386 },
        { label: "Precio", width: 125, align: "right" },
      ],
      result.rows.map((row) => [row.nombre, pdfMoney(Number(row.precio))]),
      { minRowHeight: 20 },
    );
  });
}

export async function buildOrderRequestPdf(companyId: number, orderId: number) {
  const order = await queryWithCompanyContext<{
    id: number;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    estado_pedido: string;
    observacion: string;
  }>(
    companyId,
    `
      SELECT id, nombre_cliente, dni_cliente, fecha::text,
             COALESCE(estado_pedido, 'recibido') AS estado_pedido,
             COALESCE(observacion, '') AS observacion
      FROM ventas
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [orderId, companyId],
  );
  const current = order.rows[0];
  if (!current) throw new ApiError(404, "Pedido no encontrado");

  const detail = await queryWithCompanyContext<{
    id_producto: number;
    nombre: string;
    cantidad: number;
    disponible: string;
  }>(
    companyId,
    `
      SELECT dv.id_producto,
             COALESCE(dv.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
             dv.cantidad,
             GREATEST(0, COALESCE(p.stock, 0))::text AS disponible
      FROM detalle_ventas dv
      LEFT JOIN productos p ON p.id = dv.id_producto AND p.empresa_id = dv.empresa_id
      WHERE dv.id_venta = $1 AND dv.empresa_id = $2
      ORDER BY dv.id ASC
    `,
    [orderId, companyId],
  );

  return createPdfFile(`solicitud_pedido_${orderId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Solicitud de pedido",
      code: "SP",
      number: `SP-${String(orderId).padStart(8, "0")}`,
      date: pdfDate(current.fecha),
      extra: [`Estado: ${current.estado_pedido}`],
    });
    pdf.section("Pedido");
    pdf.title(current.nombre_cliente || `Pedido #${orderId}`, 12);
    pdf.muted(`Documento: ${current.dni_cliente || "-"}${current.observacion ? ` - Obs: ${current.observacion}` : ""}`);
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 70 },
        { label: "Descripcion", width: 260 },
        { label: "Solic.", width: 58, align: "center" },
        { label: "Disp.", width: 58, align: "center" },
        { label: "Falta", width: 65, align: "center" },
      ],
      detail.rows.map((row) => {
        const requested = Number(row.cantidad);
        const available = Number(row.disponible);
        return [row.id_producto, row.nombre, pdfNumber(requested), pdfNumber(available), pdfNumber(Math.max(0, requested - available))];
      }),
    );
    pdf.note("Solicitud para control interno de stock y despacho. Marcar faltantes antes de avanzar el pedido.");
    pdf.signatures("Preparo deposito", "Controlo administracion");
  });
}
