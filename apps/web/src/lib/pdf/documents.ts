import { ApiError } from "@/lib/api-response";
import { accountBalanceExpressionSql, activeAccountMovementWhereSql } from "@/lib/accounts";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
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
import { localDateIso } from "@/lib/timezone";

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

const FISCAL_RECEIPT_LABELS: Record<number, { title: string; code: string }> = {
  1: { title: "Factura A", code: "A" },
  2: { title: "Nota de Debito A", code: "NDA" },
  3: { title: "Nota de Credito A", code: "NCA" },
  6: { title: "Factura B", code: "B" },
  7: { title: "Nota de Debito B", code: "NDB" },
  8: { title: "Nota de Credito B", code: "NCB" },
  11: { title: "Factura C", code: "C" },
  12: { title: "Nota de Debito C", code: "NDC" },
  13: { title: "Nota de Credito C", code: "NCC" },
};

function asQuoteProducts(value: unknown): QuoteProduct[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QuoteProduct => Boolean(item) && typeof item === "object");
}

function parseAccountType(value: string | null): AccountType {
  return value === "proveedor" ? "proveedor" : "cliente";
}

function fiscalReceiptLabel(receiptType: number) {
  return FISCAL_RECEIPT_LABELS[receiptType] ?? { title: `Comprobante ${receiptType}`, code: String(receiptType) };
}

function fiscalReceiptNumber(pointOfSale: number | null, receiptNumber: number | null) {
  if (!pointOfSale || !receiptNumber) return "-";
  return `${String(pointOfSale).padStart(4, "0")}-${String(receiptNumber).padStart(8, "0")}`;
}

function fiscalAmounts(receiptType: number, total: number) {
  const hasVat = [1, 2, 3, 6, 7, 8].includes(receiptType);
  if (!hasVat) return { net: total, vat: 0, total };
  const net = Number((total / 1.21).toFixed(2));
  const vat = Number((total - net).toFixed(2));
  return { net, vat, total };
}

function asFiscalDetail(value: unknown): Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const quantity = Number(item.quantity ?? item.cantidad ?? 1);
      const unitPrice = Number(item.unitPrice ?? item.precio_unit ?? 0);
      const subtotal = Number(item.subtotal ?? quantity * unitPrice);
      return {
        name: String(item.name ?? item.nombre ?? item.description ?? "Concepto"),
        quantity: Number.isFinite(quantity) ? quantity : 1,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        subtotal: Number.isFinite(subtotal) ? subtotal : 0,
      };
    });
}

function dateRangeLabel(from: string, to: string) {
  if (!from && !to) return "Completo";
  return `${from ? pdfDate(from) : "inicio"} a ${to ? pdfDate(to) : "hoy"}`;
}

function compactPdfCode(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f-]{18,}$/i.test(text)) return text.slice(0, 8).toUpperCase();
  return text || "-";
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
      footerLeft: "Validez del presupuesto",
      footerRight: `Total ${pdfMoney(quote.total)}`,
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
        { label: "Descripcion", width: 243 },
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

    const totals: [string, string][] = [["Subtotal productos", pdfMoney(quote.netAmount)]];
    if (quote.discountAmount > 0) totals.push(["Descuento", `-${pdfMoney(quote.discountAmount)}`]);
    pdf.totals(totals, "Total", pdfMoney(quote.total));
    pdf.note(
      "Documento no fiscal. Precios unitarios finales expresados en pesos argentinos. Presupuesto valido hasta la fecha indicada, sujeto a disponibilidad de stock y confirmacion comercial.",
    );
    pdf.signatures("Por Starlim S.A.S.", "Conformidad del cliente");
  });
}

export async function buildDeliveryPdf(companyId: number, deliveryId: string, includePrices: boolean) {
  const header = await queryWithCompanyContext<{
    id: string;
    sale_id: string | null;
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
      SELECT r.id::text AS id, r.sale_id::text,
             COALESCE(r.delivery_number, 0)::int AS nro_remito,
             r.client_name AS nombre_cliente,
             r.client_document AS dni_cliente,
             r.delivery_date::text AS fecha,
             COALESCE(r.payment_condition, '') AS condicion_pago,
             COALESCE(r.total_amount, 0)::text AS monto,
             COALESCE(r.seller_name, '') AS vendedor,
             COALESCE(c.province, '') AS provincia,
             '' AS sucursal_cliente,
             '' AS deposito,
             COALESCE(s.notes, '') AS observacion,
             COALESCE(c.delivery_address, c.address, '') AS domicilio,
             COALESCE(c.locality, '') AS ciudad,
             COALESCE(c.province, '') AS cliente_provincia,
             'DNI/CUIT' AS tipo_id,
             COALESCE(c.tax_id, r.client_document, '') AS nro_id,
             COALESCE(c.seller_name, '') AS vendedor_cliente,
             COALESCE(c.notes, '') AS observacion_cliente
      FROM delivery_documents r
      LEFT JOIN sales s ON s.id = r.sale_id AND s.empresa_id = r.empresa_id
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE r.id = $1::uuid AND r.empresa_id = $2
      LIMIT 1
    `,
    [deliveryId, companyId],
  );
  const remito = header.rows[0];
  if (!remito) throw new ApiError(404, "Remito no encontrado");

  const detail = await queryWithCompanyContext<{
    product_code: string;
    nombre: string;
    cantidad: string;
    precio_unit: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(d.description, p.name, '(producto eliminado)') AS nombre,
             d.quantity::text AS cantidad,
             COALESCE(d.unit_price, 0)::text AS precio_unit,
             COALESCE(d.total_amount, 0)::text AS subtotal
      FROM delivery_document_items d
      LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
      WHERE d.delivery_id = $1::uuid AND d.empresa_id = $2
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
      footerLeft: includePrices ? "Documento no valido como factura" : "Control de mercaderia - sin valores",
      footerRight: includePrices ? `Total ${pdfMoney(Number(remito.monto))}` : "Deposito",
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
    pdf.keyValue("Cond. vta.", remito.condicion_pago || "-", 54, infoY, 74, 165);
    pdf.keyValue("Vendedor", remito.vendedor || remito.vendedor_cliente || "-", 318, infoY, 64, 150);
    pdf.keyValue("Provincia", remito.provincia || "-", 54, infoY + 18, 74, 165);
    pdf.keyValue("Sucursal", remito.sucursal_cliente || "-", 318, infoY + 18, 64, 150);
    pdf.setY(infoY + 42);

    const columns = includePrices
      ? [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 70 },
          { label: "Descripcion", width: 211 },
          { label: "P. unit.", width: 84, align: "right" as const },
          { label: "Importe", width: 85, align: "right" as const },
        ]
      : [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 78 },
          { label: "Descripcion", width: 312 },
          { label: "Control", width: 60, align: "center" as const },
        ];
    const totalUnits = detail.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
    const totalAmount = detail.rows.reduce((sum, row) => sum + Number(row.subtotal), 0);
    pdf.table(
      columns,
      detail.rows.map((row) =>
        includePrices
          ? [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, pdfMoney(Number(row.precio_unit)), pdfMoney(Number(row.subtotal))]
          : [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, "[ ]"],
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
  const filters = ["m.empresa_id = $1", "m.entity_name = $2", "m.entity_type = $3", activeAccountMovementWhereSql("m", "s")];
  if (input.from) {
    params.push(input.from);
    filters.push(`m.movement_date >= $${params.length}`);
  }
  if (input.to) {
    params.push(input.to);
    filters.push(`m.movement_date <= $${params.length}`);
  }
  const fromSql = `
    FROM current_account_movements m
    LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
  `;

  const previous = input.from
    ? await queryWithCompanyContext<{ balance: string }>(
        companyId,
        `
          SELECT COALESCE(SUM(${accountBalanceExpressionSql("m")}), 0)::text AS balance
          ${fromSql}
          WHERE m.empresa_id = $1
            AND m.entity_name = $2
            AND m.entity_type = $3
            AND ${activeAccountMovementWhereSql("m", "s")}
            AND m.movement_date < $4
        `,
        [companyId, name, type, input.from],
      )
    : { rows: [{ balance: "0" }] };

  const movements = await queryWithCompanyContext<{
    description: string;
    debit: string;
    credit: string;
    movement_date: string | null;
  }>(
    companyId,
    `
      SELECT m.description, m.debit::text, m.credit::text, m.movement_date::text
      ${fromSql}
      WHERE ${filters.join(" AND ")}
      ORDER BY m.movement_date ASC NULLS LAST, m.created_at ASC
    `,
    params,
  );

  const filename = `cuenta_corriente_${safeFilename(name) || "entidad"}_${localDateIso()}.pdf`;
  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: "Cuenta corriente",
      code: "CC",
      number: `CC-${localDateIso().replaceAll("-", "")}`,
      date: pdfDate(localDateIso()),
      extra: [`Tipo: ${type === "cliente" ? "Cliente" : "Proveedor"}`, `Periodo: ${dateRangeLabel(input.from, input.to)}`],
      footerLeft: `Cuenta corriente - ${name}`,
      footerRight: dateRangeLabel(input.from, input.to),
    });
    pdf.section(type === "cliente" ? "Cliente" : "Proveedor");
    pdf.title(name, 12);
    pdf.muted(`Periodo: ${dateRangeLabel(input.from, input.to)}`);
    pdf.doc.y += 14;

    let balance = Number(previous.rows[0]?.balance ?? 0);
    const totalDebit = movements.rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const totalCredit = movements.rows.reduce((sum, row) => sum + Number(row.credit), 0);
    const rows: PdfTableCell[][] = [];
    if (input.from && Math.abs(balance) > 0.0001) {
      rows.push([pdfDate(input.from), "Saldo anterior", "-", "-", pdfMoney(balance)]);
    }
    for (const movement of movements.rows) {
      const debit = Number(movement.debit);
      const credit = Number(movement.credit);
      balance += type === "proveedor" ? credit - debit : debit - credit;
      rows.push([
        pdfDate(movement.movement_date),
        movement.description || "Movimiento de cuenta corriente",
        debit > 0 ? pdfMoney(debit) : "-",
        credit > 0 ? pdfMoney(credit) : "-",
        pdfMoney(balance),
      ]);
    }
    pdf.table(
      [
        { label: "Fecha", width: 70, align: "center" },
        { label: "Concepto", width: 236 },
        { label: "Debe", width: 66, align: "right" },
        { label: "Haber", width: 66, align: "right" },
        { label: "Saldo", width: 66, align: "right" },
      ],
      rows,
    );
    pdf.totals(
      [
        ["Saldo anterior", pdfMoney(Number(previous.rows[0]?.balance ?? 0))],
        ["Total debe", pdfMoney(totalDebit)],
        ["Total haber", pdfMoney(totalCredit)],
      ],
      Math.abs(balance) <= 0.0001
        ? "Cuenta saldada"
        : balance > 0
          ? "Saldo pendiente"
          : "Saldo a favor",
      pdfMoney(balance),
    );
    pdf.note("Este estado refleja los movimientos registrados en Starlim para la entidad y el periodo indicados.");
  });
}

export async function buildPaymentRecordPdf(companyId: number, paymentId: string) {
  const recordResult = await queryWithCompanyContext<{
    id: string;
    tipo: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    comprobante_nombre: string;
    notas: string;
    id_origen: string | null;
    tipo_origen: string;
    created_at: string;
  }>(
    companyId,
    `
      SELECT id::text AS id,
             entity_type AS tipo,
             entity_name AS entidad_nombre,
             COALESCE(concept, reference, '') AS concepto,
             amount::text AS monto,
             payment_date::text AS fecha,
             receipt_url AS comprobante_nombre,
             notes AS notas,
             sale_id::text AS id_origen,
             CASE WHEN sale_id IS NULL THEN '' ELSE 'venta' END AS tipo_origen,
             created_at::text
      FROM payments
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [paymentId, companyId],
  );
  const record = recordResult.rows[0];
  if (!record) throw new ApiError(404, "Registro no encontrado");

  const isCollection = record.tipo === "cobro";
  const filename = `registro_pago_${paymentId}.pdf`;
  const paymentNumber = `${isCollection ? "RP" : "PG"}-${paymentId.slice(0, 8).toUpperCase()}`;
  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: isCollection ? "Recibo de pago" : "Comprobante de pago",
      code: isCollection ? "RP" : "PG",
      number: paymentNumber,
      date: pdfDate(record.fecha || record.created_at),
      extra: [isCollection ? "Cobro de cliente" : "Pago a proveedor"],
      footerLeft: isCollection ? "Comprobante de cobranza" : "Comprobante de pago",
      footerRight: pdfMoney(Number(record.monto)),
    });
    pdf.section(isCollection ? "Recibimos de" : "Pagamos a");
    pdf.title(record.entidad_nombre || "-", 12);
    pdf.infoBox(isCollection ? "Importe recibido" : "Importe pagado", [
      record.concepto || (isCollection ? "Cobro aprobado" : "Pago registrado"),
      pdfMoney(Number(record.monto)),
    ]);
    pdf.section("Medio de pago");
    pdf.keyValue("Origen", record.tipo_origen || "-", 54, pdf.y + 2, 70, 160);
    pdf.keyValue("Registro", String(record.id), 318, pdf.y + 2, 70, 130);
    pdf.setY(pdf.y + 34);
    pdf.table(
      [
        { label: "Comprobante", width: 207 },
        { label: "Fecha", width: 90, align: "center" },
        { label: "Importe", width: 103, align: "right" },
        { label: "Aplicado", width: 104, align: "right" },
      ],
      [[record.concepto || `Registro #${record.id}`, pdfDate(record.fecha), pdfMoney(Number(record.monto)), pdfMoney(Number(record.monto))]],
    );
    if (record.notas || record.comprobante_nombre) {
      pdf.note([record.notas, record.comprobante_nombre ? "Comprobante adjunto: si" : ""].filter(Boolean).join(" "));
    }
    pdf.signatures(isCollection ? "Recibi conforme - Starlim" : "Autorizo pago - Starlim", "Aclaracion y firma");
  });
}

export async function buildFiscalSalePdf(companyId: number, saleId: string) {
  const header = await queryWithCompanyContext<{
    id: string;
    sale_number: string;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    monto: string;
    condicion_pago: string;
    fiscal_point_of_sale: number | null;
    fiscal_receipt_type: number | null;
    fiscal_receipt_number: number | null;
    cae: string;
    cae_expires_at: string | null;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             s.sale_date::text AS fecha,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(s.payment_condition, '') AS condicion_pago,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_type,
             s.fiscal_receipt_number,
             COALESCE(s.cae, '') AS cae,
             s.cae_expires_at::text
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid
        AND s.empresa_id = $2
        AND COALESCE(s.fiscal_status, 'no_enviado') = 'aprobado'
        AND COALESCE(s.cae, '') <> ''
        AND COALESCE(s.cae, '') <> 'manual'
        AND s.fiscal_point_of_sale IS NOT NULL
        AND s.fiscal_receipt_type IS NOT NULL
        AND s.fiscal_receipt_number IS NOT NULL
      LIMIT 1
    `,
    [saleId, companyId],
  );
  const sale = header.rows[0];
  if (!sale) throw new ApiError(404, "Factura fiscal no encontrada");

  const detail = await queryWithCompanyContext<{
    nombre: string;
    cantidad: string;
    precio_unit: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(si.description, p.name, 'Concepto') AS nombre,
             COALESCE(si.quantity, 0)::text AS cantidad,
             COALESCE(si.unit_price, 0)::text AS precio_unit,
             COALESCE(si.total_amount, si.quantity * si.unit_price, 0)::text AS subtotal
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
      WHERE si.sale_id = $1::uuid AND si.empresa_id = $2
      ORDER BY si.id ASC
    `,
    [saleId, companyId],
  );

  const receiptType = Number(sale.fiscal_receipt_type ?? 0);
  const receipt = fiscalReceiptLabel(receiptType);
  const total = Number(sale.monto);
  const amounts = fiscalAmounts(receiptType, total);
  const number = fiscalReceiptNumber(sale.fiscal_point_of_sale, sale.fiscal_receipt_number);

  return createPdfFile(`factura_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: receipt.title,
      code: receipt.code,
      number,
      date: pdfDate(sale.fecha),
      extra: [`CAE ${sale.cae}`, sale.cae_expires_at ? `Vto. CAE ${pdfDate(sale.cae_expires_at)}` : ""].filter(Boolean),
      variant: "fiscal",
      footerLeft: "Comprobante autorizado - ARCA",
      footerRight: `Total ${pdfMoney(amounts.total)}`,
    });
    pdf.section("Cliente");
    pdf.title(sale.nombre_cliente || "Sin cliente", 12);
    pdf.muted([sale.dni_cliente ? `CUIT/DNI ${sale.dni_cliente}` : "", sale.condicion_pago].filter(Boolean).join(" - ") || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Cant.", width: 54 },
        { label: "Descripcion", width: 265 },
        { label: "P. unit.", width: 92, align: "right" },
        { label: "Importe", width: 93, align: "right" },
      ],
      detail.rows.map((row) => [
        pdfNumber(Number(row.cantidad)),
        row.nombre,
        pdfMoney(Number(row.precio_unit)),
        pdfMoney(Number(row.subtotal)),
      ]),
      { accentHeader: true },
    );
    pdf.totals(
      [
        ["Neto gravado", pdfMoney(amounts.net)],
        ["IVA 21%", pdfMoney(amounts.vat)],
      ],
      "Total",
      pdfMoney(amounts.total),
    );
    pdf.note("Comprobante emitido desde Starlim ERP con CAE registrado en ARCA.");
  });
}

export async function buildFiscalSalesNotePdf(companyId: number, noteId: string) {
  const result = await queryWithCompanyContext<{
    id: string;
    class_name: string;
    receipt_type: number;
    receipt_number: number | null;
    amount: string;
    detail_json: unknown;
    reason: string;
    created_at: string;
    fiscal_point_of_sale: number | null;
    fiscal_receipt_type: number | null;
    fiscal_receipt_number: number | null;
    cae: string;
    cae_expires_at: string | null;
    sale_fiscal_point_of_sale: number | null;
    sale_fiscal_receipt_type: number | null;
    sale_fiscal_receipt_number: number | null;
    cliente: string;
    documento: string;
  }>(
    companyId,
    `
      SELECT sid.id::text AS id,
             sid.class_name,
             COALESCE(sid.receipt_type, 0)::int AS receipt_type,
             sid.receipt_number,
             COALESCE(sid.amount, 0)::text AS amount,
             sid.detail_json,
             COALESCE(sid.reason, '') AS reason,
             sid.created_at::text,
             sid.fiscal_point_of_sale,
             sid.fiscal_receipt_type,
             sid.fiscal_receipt_number,
             COALESCE(sid.cae, '') AS cae,
             sid.cae_expires_at::text,
             s.fiscal_point_of_sale AS sale_fiscal_point_of_sale,
             s.fiscal_receipt_type AS sale_fiscal_receipt_type,
             s.fiscal_receipt_number AS sale_fiscal_receipt_number,
             COALESCE(s.client_name, c.display_name, '') AS cliente,
             COALESCE(s.client_document, c.tax_id, '') AS documento
      FROM sales_internal_documents sid
      LEFT JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE sid.id = $1::uuid
        AND sid.empresa_id = $2
        AND sid.fiscal = true
        AND COALESCE(sid.fiscal_status, 'no_enviado') = 'aprobado'
        AND COALESCE(sid.cae, '') <> ''
        AND sid.fiscal_point_of_sale IS NOT NULL
        AND sid.fiscal_receipt_type IS NOT NULL
        AND sid.fiscal_receipt_number IS NOT NULL
      LIMIT 1
    `,
    [noteId, companyId],
  );
  const note = result.rows[0];
  if (!note) throw new ApiError(404, "Nota fiscal no encontrada");

  const receiptType = Number(note.fiscal_receipt_type ?? note.receipt_type);
  const receipt = fiscalReceiptLabel(receiptType);
  const number = fiscalReceiptNumber(note.fiscal_point_of_sale, note.fiscal_receipt_number ?? note.receipt_number);
  const total = Number(note.amount);
  const amounts = fiscalAmounts(receiptType, total);
  const detail = asFiscalDetail(note.detail_json);
  const associated = fiscalReceiptNumber(note.sale_fiscal_point_of_sale, note.sale_fiscal_receipt_number);

  return createPdfFile(`${safeFilename(receipt.title)}_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: receipt.title,
      code: receipt.code,
      number,
      date: pdfDate(note.created_at),
      extra: [`CAE ${note.cae}`, note.cae_expires_at ? `Vto. CAE ${pdfDate(note.cae_expires_at)}` : ""].filter(Boolean),
      variant: "fiscal",
      footerLeft: "Nota fiscal autorizada - ARCA",
      footerRight: `Total ${pdfMoney(amounts.total)}`,
    });
    pdf.section("Cliente");
    pdf.title(note.cliente || "Sin cliente", 12);
    pdf.muted([note.documento ? `CUIT/DNI ${note.documento}` : "", associated !== "-" ? `Asociado a factura ${associated}` : ""].filter(Boolean).join(" - ") || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Cant.", width: 54 },
        { label: "Descripcion", width: 265 },
        { label: "P. unit.", width: 92, align: "right" },
        { label: "Importe", width: 93, align: "right" },
      ],
      detail.map((row) => [
        pdfNumber(row.quantity),
        row.name,
        pdfMoney(row.unitPrice),
        pdfMoney(row.subtotal),
      ]),
      { accentHeader: true },
    );
    pdf.totals(
      [
        ["Neto gravado", pdfMoney(amounts.net)],
        ["IVA 21%", pdfMoney(amounts.vat)],
      ],
      "Total",
      pdfMoney(amounts.total),
    );
    pdf.note(note.reason || `Comprobante asociado a factura ${associated}.`);
  });
}

export async function buildPurchaseOrderPdf(companyId: number, purchaseId: string) {
  const purchase = await getPurchase(companyId, purchaseId);
  const purchaseNumber = `OC-${String(purchase.id).slice(0, 8).toUpperCase()}`;
  return createPdfFile(`orden_compra_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Orden de compra",
      code: "OC",
      number: purchaseNumber,
      date: pdfDate(purchase.date),
      extra: [`Estado: ${purchase.status}`],
      footerLeft: `Proveedor: ${purchase.supplierName || "-"}`,
      footerRight: `Total ${pdfMoney(purchase.total)}`,
    });
    pdf.section("Proveedor");
    pdf.title(purchase.supplierName || `Compra #${purchase.id}`, 12);
    pdf.muted(purchase.description || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 72 },
        { label: "Descripcion", width: 253 },
        { label: "Cant.", width: 64, align: "center" },
        { label: "Costo ref.", width: 115, align: "right" },
      ],
      purchase.items.map((item) => [compactPdfCode(item.productId), item.name, pdfNumber(item.quantity), "-"]),
    );
    pdf.totals([["Items", String(purchase.items.length)]], "Total", pdfMoney(purchase.total));
    pdf.note("Orden emitida desde Starlim. Verificar cantidades, condiciones comerciales y recepcion de mercaderia.");
    pdf.signatures("Autorizo compra - Starlim", "Proveedor / recepcion");
  });
}

export async function buildPurchaseReturnRequestPdf(companyId: number, purchaseId: string, reason: string) {
  const purchase = await getPurchase(companyId, purchaseId);
  const returnNumber = `SD-${String(purchase.id).slice(0, 8).toUpperCase()}`;
  return createPdfFile(`solicitud_devolucion_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Solicitud de devolucion",
      code: "SD",
      number: returnNumber,
      date: pdfDate(localDateIso()),
      extra: [`Compra: ${String(purchase.id).slice(0, 8).toUpperCase()}`, `Estado: ${purchase.status}`],
      footerLeft: "Devolucion a proveedor",
      footerRight: `Ref. compra ${purchase.id}`,
    });
    pdf.section("Proveedor");
    pdf.title(purchase.supplierName || `Compra #${purchase.id}`, 12);
    pdf.muted(purchase.description || "-");
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 72 },
        { label: "Descripcion", width: 293 },
        { label: "Cant.", width: 64, align: "center" },
        { label: "Motivo", width: 75 },
      ],
      purchase.items.map((item) => [compactPdfCode(item.productId), item.name, pdfNumber(item.quantity), reason || "A revisar"]),
    );
    pdf.note(reason || "Solicitud operativa de devolucion. Confirmar productos y cantidades antes del despacho.");
    pdf.signatures("Solicita Starlim", "Recibe proveedor");
  });
}

export async function buildPriceListPdf(companyId: number, list: number) {
  const cols = {
    0: { expr: "precio_0", label: "L0 - agresivo" },
    1: { expr: "precio_1", label: "L1 - suave" },
    2: { expr: "precio_2", label: "L2 - ANCLA" },
    3: { expr: "precio_3", label: "L3 - caro" },
    4: { expr: "precio_minorista", label: "Minorista" },
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
      date: pdfDate(localDateIso()),
      extra: [`Productos: ${result.rows.length}`],
      footerLeft: "Lista de precios",
      footerRight: selected.label,
    });
    pdf.table(
      [
        { label: "Producto", width: 379 },
        { label: "Precio", width: 125, align: "right" },
      ],
      result.rows.map((row) => [row.nombre, pdfMoney(Number(row.precio))]),
      { minRowHeight: 20 },
    );
  });
}

export async function buildOrderRequestPdf(companyId: number, orderId: string) {
  const order = await queryWithCompanyContext<{
    id: string;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    estado_pedido: string;
    observacion: string;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             s.sale_date::text AS fecha,
             ${normalizedOrderStatusSql("s")} AS estado_pedido,
             COALESCE(s.notes, '') AS observacion
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [orderId, companyId],
  );
  const current = order.rows[0];
  if (!current) throw new ApiError(404, "Pedido no encontrado");

  const detail = await queryWithCompanyContext<{
    product_code: string;
    nombre: string;
    cantidad: string;
    disponible: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(dv.description, p.name, '(producto eliminado)') AS nombre,
             dv.quantity::text AS cantidad,
             GREATEST(0, COALESCE(stock.current_stock, 0))::text AS disponible
      FROM sale_items dv
      LEFT JOIN products p ON p.id = dv.product_id AND p.empresa_id = dv.empresa_id
      LEFT JOIN LATERAL (
        SELECT SUM(
          CASE
            WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
            ELSE -sm.quantity
          END
        ) AS current_stock
        FROM stock_movements sm
        WHERE sm.product_id = dv.product_id AND sm.empresa_id = dv.empresa_id
      ) stock ON true
      WHERE dv.sale_id = $1::uuid AND dv.empresa_id = $2
      ORDER BY dv.id ASC
    `,
    [orderId, companyId],
  );

  return createPdfFile(`solicitud_pedido_${orderId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Solicitud de pedido",
      code: "SP",
      number: `SP-${orderId.slice(0, 8).toUpperCase()}`,
      date: pdfDate(current.fecha),
      extra: [`Estado: ${current.estado_pedido}`],
      variant: "internal",
      footerLeft: "Control de deposito - paso previo al armado",
      footerRight: "Uso interno",
    });
    pdf.section("Pedido");
    pdf.title(current.nombre_cliente || `Pedido #${orderId}`, 12);
    pdf.muted(`Documento: ${current.dni_cliente || "-"}${current.observacion ? ` - Obs: ${current.observacion}` : ""}`);
    pdf.doc.y += 14;
    pdf.table(
      [
        { label: "Codigo", width: 70 },
        { label: "Descripcion", width: 253 },
        { label: "Solic.", width: 58, align: "center" },
        { label: "Disp.", width: 58, align: "center" },
        { label: "Falta", width: 65, align: "center" },
      ],
      detail.rows.map((row) => {
        const requested = Number(row.cantidad);
        const available = Number(row.disponible);
        return [row.product_code, row.nombre, pdfNumber(requested), pdfNumber(available), pdfNumber(Math.max(0, requested - available))];
      }),
    );
    pdf.note("Solicitud para control interno de stock y despacho. Marcar faltantes antes de avanzar el pedido.");
    pdf.signatures("Preparo deposito", "Controlo administracion");
  });
}
