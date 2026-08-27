import { ApiError } from "@/lib/api-response";
import QRCode from "qrcode";
import { accountBalanceExpressionSql, activeAccountMovementWhereSql } from "@/lib/accounts";
import { queryWithCompanyContext } from "@/lib/db";
import { collapsePaymentAllocations } from "@/lib/customer-accounts";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { productMarginCodeExpression } from "@/lib/product-pricing-sql";
import {
  applyVat,
  normalizeGroupBy,
  normalizeStock,
  normalizeVat,
  vatLegend,
  type PriceListGroupBy,
  type PriceListStock,
  type PriceListVat,
} from "@/lib/price-list-export";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { getPurchase } from "@/lib/purchases";
import { getQuote } from "@/lib/quotes";
import {
  companyInfo,
  createPdfFile,
  pdfDate,
  pdfMoney,
  pdfNumber,
  safeFilename,
  type PdfTableCell,
} from "@/lib/pdf/renderer";
import { localDateIso } from "@/lib/timezone";
import {
  allocateAmountByWeights,
  formatVatRate,
  isFinalTotalConsistent,
  isSaleVatRate,
  normalizeStoredVatRate,
  requireValuedRemittanceVatRate,
  valuedDocumentLines,
  valuedDocumentSummary,
  vatAmountsFromGross,
  type StoredVatRate,
} from "@/lib/vat-calculation";

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

const FISCAL_RECEIPT_LABELS: Record<number, { title: string; letter: string; afipCode: string }> = {
  1: { title: "Factura A", letter: "A", afipCode: "01" },
  2: { title: "Nota de Debito A", letter: "A", afipCode: "02" },
  3: { title: "Nota de Credito A", letter: "A", afipCode: "03" },
  6: { title: "Factura B", letter: "B", afipCode: "06" },
  7: { title: "Nota de Debito B", letter: "B", afipCode: "07" },
  8: { title: "Nota de Credito B", letter: "B", afipCode: "08" },
  11: { title: "Factura C", letter: "C", afipCode: "11" },
  12: { title: "Nota de Debito C", letter: "C", afipCode: "12" },
  13: { title: "Nota de Credito C", letter: "C", afipCode: "13" },
};

function asQuoteProducts(value: unknown): QuoteProduct[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is QuoteProduct => Boolean(item) && typeof item === "object");
}

function parseAccountType(value: string | null): AccountType {
  return value === "proveedor" ? "proveedor" : "cliente";
}

function fiscalReceiptLabel(receiptType: number) {
  return FISCAL_RECEIPT_LABELS[receiptType] ?? { title: `Comprobante ${receiptType}`, letter: "-", afipCode: String(receiptType) };
}

function fiscalReceiptNumber(pointOfSale: number | null, receiptNumber: number | null) {
  if (!pointOfSale || !receiptNumber) return "-";
  return `${String(pointOfSale).padStart(4, "0")}-${String(receiptNumber).padStart(8, "0")}`;
}

function digitsOnly(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function arcaDate(value: string | null | undefined) {
  if (!value) return localDateIso();
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const raw = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return localDateIso();
  return date.toISOString().slice(0, 10);
}

function recipientDocumentType(document: string) {
  const digits = digitsOnly(document);
  if (digits.length === 11) return 80;
  if (digits.length >= 7) return 96;
  return 99;
}

async function buildArcaQrImage(input: {
  issueDate: string | null;
  pointOfSale: number;
  receiptType: number;
  receiptNumber: number;
  total: number;
  customerDocument: string;
  cae: string;
}) {
  const customerDocument = digitsOnly(input.customerDocument);
  const payload = {
    ver: 1,
    fecha: arcaDate(input.issueDate),
    cuit: Number(digitsOnly(companyInfo.cuit)),
    ptoVta: input.pointOfSale,
    tipoCmp: input.receiptType,
    nroCmp: input.receiptNumber,
    importe: Number(input.total.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: recipientDocumentType(input.customerDocument),
    nroDocRec: customerDocument ? Number(customerDocument) : 0,
    tipoCodAut: "E",
    codAut: Number(digitsOnly(input.cae)),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const url = `https://www.arca.gob.ar/fe/qr/?p=${encodeURIComponent(encoded)}`;
  const qr = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 1, width: 160 });
  const image = new ArrayBuffer(qr.byteLength);
  new Uint8Array(image).set(qr);
  return image;
}

function fiscalAmounts(receiptType: number, total: number, vatRate: number) {
  const hasVat = [1, 2, 3, 6, 7, 8].includes(receiptType);
  if (!hasVat) return { net: total, vat: 0, total, hasVat };
  if (vatRate !== 21) {
    throw new ApiError(
      409,
      "La Factura o Nota A/B no registra la alicuota IVA 21% autorizada. No se reinterpretaron datos historicos.",
    );
  }
  return { ...vatAmountsFromGross(total, 21), hasVat };
}

function vatLabel(vatRate: StoredVatRate) {
  return vatRate > 0 ? `${formatVatRate(vatRate)}%` : "-";
}

function valuedPdfVatRate(value: unknown, context: {
  desiredDocument: string;
  receiptType: number | null;
  fiscalReceiptType: number | null;
}) {
  try {
    return requireValuedRemittanceVatRate(value, context);
  } catch (error) {
    throw new ApiError(
      409,
      error instanceof Error
        ? error.message
        : "El remito valorizado no tiene una alicuota IVA compatible con el comprobante persistido.",
    );
  }
}

function assertValuedPdfTotal(totalAmount: number, netAmount: number, vatRate: StoredVatRate) {
  if (!isSaleVatRate(vatRate) || !isFinalTotalConsistent(totalAmount, netAmount, vatRate)) {
    throw new ApiError(
      409,
      "El total almacenado no coincide con los renglones netos mas IVA. Use el remito sin precios para no reinterpretar una venta historica.",
    );
  }
}

function asFiscalDetail(value: unknown): Array<{ code: string; name: string; quantity: number; unitPrice: number; subtotal: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const quantity = Number(item.quantity ?? item.cantidad ?? 1);
      const unitPrice = Number(item.unitPrice ?? item.precio_unit ?? 0);
      const subtotal = Number(item.subtotal ?? quantity * unitPrice);
      return {
        code: String(item.code ?? item.codigo ?? item.product_code ?? ""),
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
  const filename = `presupuesto_${safeFilename(quote.quoteNumber)}.pdf`;

  return createPdfFile(filename, ({ pdf }) => {
    pdf.drawHeader({
      title: "Presupuesto",
      code: "P",
      number: quote.quoteNumber,
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
    if (quote.includeVat) {
      totals.push(
        ["Subtotal antes de IVA", pdfMoney(quote.subtotal)],
        [`IVA ${String(quote.vatRate).replace(".", ",")}%`, pdfMoney(quote.vatAmount)],
      );
    }
    pdf.totals(totals, "Total", pdfMoney(quote.total));
    pdf.note(
      `Documento no fiscal. ${quote.includeVat ? `IVA ${String(quote.vatRate).replace(".", ",")}% discriminado.` : "IVA no discriminado."} Presupuesto valido hasta la fecha indicada, sujeto a disponibilidad de stock y confirmacion comercial.`,
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
    vat_rate: string;
    desired_document: string;
    receipt_type: number | null;
    fiscal_receipt_type: number | null;
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
             COALESCE(s.vat_rate, 0)::text AS vat_rate,
             COALESCE(s.desired_document, '') AS desired_document,
             s.receipt_type,
             s.fiscal_receipt_type,
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
    descuento: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(d.description, p.name, '(producto eliminado)') AS nombre,
             d.quantity::text AS cantidad,
             COALESCE(d.unit_price, 0)::text AS precio_unit,
             COALESCE(d.discount, 0)::text AS descuento,
             COALESCE(d.total_amount, 0)::text AS subtotal
      FROM delivery_document_items d
      LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
      WHERE d.delivery_id = $1::uuid AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [deliveryId, companyId],
  );

  const number = String(remito.nro_remito).padStart(8, "0");
  const vatRate = includePrices
    ? valuedPdfVatRate(remito.vat_rate, {
        desiredDocument: remito.desired_document,
        receiptType: remito.receipt_type,
        fiscalReceiptType: remito.fiscal_receipt_type,
      })
    : normalizeStoredVatRate(remito.vat_rate);
  const valuedLines = valuedDocumentLines(detail.rows.map((row) => ({
    quantity: Number(row.cantidad),
    unitPrice: Number(row.precio_unit),
    discountPercent: Number(row.descuento),
    netAmount: Number(row.subtotal),
  })), vatRate);
  const valuedSummary = valuedDocumentSummary(valuedLines);
  if (includePrices) assertValuedPdfTotal(Number(remito.monto), valuedSummary.net, vatRate);
  return createPdfFile(`${includePrices ? "remito_con_precios" : "remito"}_${number}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Remito",
      code: "R",
      number,
      date: pdfDate(remito.fecha),
      extra: [includePrices ? "Documento valorizado" : "Control de mercaderia", remito.deposito ? `Deposito: ${remito.deposito}` : ""].filter(Boolean),
      footerLeft: includePrices ? "Documento no valido como factura" : "Control de mercaderia - sin valores",
      footerRight: includePrices ? `Total final ${pdfMoney(valuedSummary.total)}` : "Deposito",
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
          { label: "Cant.", width: 30 },
          { label: "Codigo", width: 40 },
          { label: "Descripcion", width: 100 },
          { label: "P. lista neto", width: 58, align: "right" as const },
          { label: "Desc. %", width: 38, align: "right" as const },
          { label: "Unit. neto", width: 58, align: "right" as const },
          { label: "IVA %", width: 34, align: "center" as const },
          { label: "Unit. final", width: 62, align: "right" as const },
          { label: "Subtotal final", width: 75, align: "right" as const },
        ]
      : [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 78 },
          { label: "Descripcion", width: 312 },
          { label: "Control", width: 60, align: "center" as const },
        ];
    const totalUnits = detail.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
    pdf.table(
      columns,
      detail.rows.map((row, index) =>
        includePrices
          ? [
              pdfNumber(Number(row.cantidad)),
              row.product_code,
              row.nombre,
              pdfMoney(Number(row.precio_unit)),
              Number(row.descuento) > 0 ? `${pdfNumber(Number(row.descuento))}%` : "-",
              pdfMoney(valuedLines[index].netUnitPrice),
              vatLabel(vatRate),
              pdfMoney(valuedLines[index].finalUnitPrice),
              pdfMoney(valuedLines[index].total),
            ]
          : [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, "[ ]"],
      ),
      includePrices ? { density: "compact" } : {},
    );
    pdf.totals(
      includePrices
        ? [
            ["Total de unidades", pdfNumber(totalUnits)],
            ["Subtotal neto", pdfMoney(valuedSummary.net)],
            [`IVA ${vatLabel(vatRate)}`, pdfMoney(valuedSummary.vat)],
          ]
        : [["Total de unidades", pdfNumber(totalUnits)]],
      includePrices ? "Total final" : "Control",
      includePrices ? pdfMoney(valuedSummary.total) : "",
    );
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
    id: string;
    description: string;
    debit: string;
    credit: string;
    movement_date: string | null;
    payment_id: string | null;
  }>(
    companyId,
    `
      SELECT m.id::text, m.description, m.debit::text, m.credit::text,
             m.movement_date::text, m.payment_id::text
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

    const displayMovements = type === "cliente"
      ? collapsePaymentAllocations(movements.rows.map((row) => ({
          id: row.id,
          date: row.movement_date ?? "",
          description: row.description ?? "",
          debit: Number(row.debit),
          credit: Number(row.credit),
          kind: "",
          paymentId: row.payment_id,
        })))
      : movements.rows.map((row) => ({
          id: row.id,
          date: row.movement_date ?? "",
          description: row.description ?? "",
          debit: Number(row.debit),
          credit: Number(row.credit),
          kind: "",
        }));
    let balance = Number(previous.rows[0]?.balance ?? 0);
    const totalDebit = displayMovements.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = displayMovements.reduce((sum, row) => sum + row.credit, 0);
    const rows: PdfTableCell[][] = [];
    if (input.from && Math.abs(balance) > 0.0001) {
      rows.push([pdfDate(input.from), "Saldo anterior", "-", "-", pdfMoney(balance)]);
    }
    for (const movement of displayMovements) {
      const debit = movement.debit;
      const credit = movement.credit;
      balance += type === "proveedor" ? credit - debit : debit - credit;
      rows.push([
        pdfDate(movement.date),
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
    condicion_iva_cliente: string;
    domicilio_cliente: string;
    sale_date: string | null;
    fiscal_issue_date: string | null;
    monto: string;
    condicion_pago: string;
    fiscal_point_of_sale: number | null;
    fiscal_receipt_type: number | null;
    fiscal_receipt_number: number | null;
    cae: string;
    cae_expires_at: string | null;
    vat_rate: string;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             COALESCE(c.fiscal_condition, '') AS condicion_iva_cliente,
             COALESCE(c.delivery_address, c.address, '') AS domicilio_cliente,
             s.sale_date::text AS sale_date,
             COALESCE(
               s.fiscal_issue_date,
               (s.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
               s.sale_date
             )::text AS fiscal_issue_date,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(s.payment_condition, '') AS condicion_pago,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_type,
             s.fiscal_receipt_number,
             COALESCE(s.cae, '') AS cae,
             s.cae_expires_at::text,
             CASE
               WHEN s.fiscal_vat_rate = 21 THEN 21
               WHEN s.fiscal_vat_rate IS NULL
                 AND s.fiscal_receipt_type IN (1, 2, 3, 6, 7, 8) THEN 21
               ELSE 0
             END::text AS vat_rate
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
    product_code: string;
    nombre: string;
    cantidad: string;
    precio_unit: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(si.description, p.name, 'Concepto') AS nombre,
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
  if (detail.rows.length === 0) {
    throw new ApiError(409, "La factura fiscal no tiene detalle de productos y no puede generarse.");
  }

  const receiptType = Number(sale.fiscal_receipt_type ?? 0);
  const receipt = fiscalReceiptLabel(receiptType);
  const total = Number(sale.monto);
  const vatRate = normalizeStoredVatRate(sale.vat_rate);
  const amounts = fiscalAmounts(receiptType, total, vatRate);
  const allocatedDetailAmounts = allocateAmountByWeights(
    amounts.hasVat ? amounts.net : amounts.total,
    detail.rows.map((row) => Number(row.subtotal)),
  );
  const allocatedDetailFinalAmounts = allocateAmountByWeights(
    amounts.total,
    detail.rows.map((row) => Number(row.subtotal)),
  );
  const number = fiscalReceiptNumber(sale.fiscal_point_of_sale, sale.fiscal_receipt_number);
  const qrImage = await buildArcaQrImage({
    issueDate: sale.fiscal_issue_date,
    pointOfSale: Number(sale.fiscal_point_of_sale),
    receiptType,
    receiptNumber: Number(sale.fiscal_receipt_number),
    total,
    customerDocument: sale.dni_cliente,
    cae: sale.cae,
  });

  return createPdfFile(`factura_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: receipt.title,
      code: receipt.letter,
      fiscalCode: receipt.afipCode,
      number,
      date: pdfDate(sale.fiscal_issue_date),
      extra: [`Periodo: ${pdfDate(sale.sale_date)}`, sale.cae_expires_at ? `Vto: ${pdfDate(sale.cae_expires_at)}` : ""].filter(Boolean),
      variant: "fiscal",
      footerLeft: "Comprobante autorizado - ARCA",
      footerRight: `Total ${pdfMoney(amounts.total)}`,
    });
    pdf.fiscalClientBox({
      name: sale.nombre_cliente || "Sin cliente",
      document: sale.dni_cliente,
      ivaCondition: sale.condicion_iva_cliente,
      address: sale.domicilio_cliente,
      saleCondition: sale.condicion_pago,
    });
    pdf.fiscalItemsTable(
      detail.rows.map((row) => [
        row,
        Number(row.cantidad),
        Number(row.precio_unit),
        Number(row.subtotal),
      ] as const).map(([row, quantity, unitPrice], index) => {
        const lineNetAmount = allocatedDetailAmounts[index] ?? 0;
        const effectiveUnitPrice = quantity > 0 ? lineNetAmount / quantity : 0;
        const combinedDiscount = amounts.hasVat && unitPrice > 0
          ? Math.max(0, Math.min(100, (1 - effectiveUnitPrice / unitPrice) * 100))
          : 0;
        return {
          code: row.product_code,
          description: row.nombre,
          quantity: pdfNumber(quantity),
          unit: "unidades",
          unitPrice: pdfMoney(amounts.hasVat ? unitPrice : effectiveUnitPrice),
          discount: pdfNumber(combinedDiscount),
          vatRate: amounts.hasVat ? vatLabel(vatRate) : "-",
          subtotal: pdfMoney(allocatedDetailFinalAmounts[index] ?? 0),
        };
      }),
    );
    const fiscalRows: [string, string][] = amounts.hasVat
      ? [
          ["Importe Neto Gravado", pdfMoney(amounts.net)],
          [`IVA ${vatLabel(vatRate)}`, pdfMoney(amounts.vat)],
          ["Importe Otros Tributos", pdfMoney(0)],
        ]
      : [["Importe", pdfMoney(amounts.total)], ["Importe Otros Tributos", pdfMoney(0)]];
    pdf.fiscalSummary(fiscalRows, "Importe Total", pdfMoney(amounts.total));
    pdf.fiscalAuthorizationBox(sale.cae, sale.cae_expires_at ? pdfDate(sale.cae_expires_at) : "-", qrImage);
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
    fiscal_issue_date: string | null;
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
    condicion_iva_cliente: string;
    domicilio_cliente: string;
    condicion_pago: string;
    vat_rate: string;
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
             COALESCE(
               sid.fiscal_issue_date,
               (sid.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
               sid.created_at::date
             )::text AS fiscal_issue_date,
             sid.fiscal_point_of_sale,
             sid.fiscal_receipt_type,
             sid.fiscal_receipt_number,
             COALESCE(sid.cae, '') AS cae,
             sid.cae_expires_at::text,
             s.fiscal_point_of_sale AS sale_fiscal_point_of_sale,
             s.fiscal_receipt_type AS sale_fiscal_receipt_type,
             s.fiscal_receipt_number AS sale_fiscal_receipt_number,
             COALESCE(s.client_name, c.display_name, '') AS cliente,
             COALESCE(s.client_document, c.tax_id, '') AS documento,
             COALESCE(c.fiscal_condition, '') AS condicion_iva_cliente,
             COALESCE(c.delivery_address, c.address, '') AS domicilio_cliente,
             COALESCE(s.payment_condition, '') AS condicion_pago,
             CASE
               WHEN sid.fiscal_vat_rate = 21 THEN 21
               WHEN sid.fiscal_vat_rate IS NULL
                 AND sid.fiscal_receipt_type IN (1, 2, 3, 6, 7, 8) THEN 21
               ELSE 0
             END::text AS vat_rate
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
  const vatRate = normalizeStoredVatRate(note.vat_rate);
  const amounts = fiscalAmounts(receiptType, total, vatRate);
  const detail = asFiscalDetail(note.detail_json);
  if (detail.length === 0) {
    throw new ApiError(409, "La nota fiscal no tiene detalle y no puede generarse.");
  }
  const allocatedDetailAmounts = allocateAmountByWeights(
    amounts.hasVat ? amounts.net : amounts.total,
    detail.map((row) => row.subtotal),
  );
  const allocatedDetailFinalAmounts = allocateAmountByWeights(
    amounts.total,
    detail.map((row) => row.subtotal),
  );
  const associated = fiscalReceiptNumber(note.sale_fiscal_point_of_sale, note.sale_fiscal_receipt_number);
  const qrImage = await buildArcaQrImage({
    issueDate: note.fiscal_issue_date,
    pointOfSale: Number(note.fiscal_point_of_sale),
    receiptType,
    receiptNumber: Number(note.fiscal_receipt_number ?? note.receipt_number),
    total,
    customerDocument: note.documento,
    cae: note.cae,
  });

  return createPdfFile(`${safeFilename(receipt.title)}_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: receipt.title,
      code: receipt.letter,
      fiscalCode: receipt.afipCode,
      number,
      date: pdfDate(note.fiscal_issue_date),
      extra: [`Periodo: ${pdfDate(note.fiscal_issue_date)}`, note.cae_expires_at ? `Vto: ${pdfDate(note.cae_expires_at)}` : ""].filter(Boolean),
      variant: "fiscal",
      footerLeft: "Nota fiscal autorizada - ARCA",
      footerRight: `Total ${pdfMoney(amounts.total)}`,
    });
    pdf.fiscalClientBox({
      name: note.cliente || "Sin cliente",
      document: note.documento,
      ivaCondition: note.condicion_iva_cliente,
      address: note.domicilio_cliente,
      saleCondition: note.condicion_pago || "-",
      associatedDocument: associated,
    });
    pdf.fiscalItemsTable(
      detail.map((row, index) => ({
        code: row.code,
        description: row.name,
        quantity: pdfNumber(row.quantity),
        unit: "unidades",
        unitPrice: pdfMoney(row.quantity > 0 ? (allocatedDetailAmounts[index] ?? 0) / row.quantity : 0),
        discount: "0,00",
        vatRate: amounts.hasVat ? vatLabel(vatRate) : "-",
        subtotal: pdfMoney(allocatedDetailFinalAmounts[index] ?? 0),
      })),
    );
    const fiscalRows: [string, string][] = amounts.hasVat
      ? [
          ["Importe Neto Gravado", pdfMoney(amounts.net)],
          [`IVA ${vatLabel(vatRate)}`, pdfMoney(amounts.vat)],
          ["Importe Otros Tributos", pdfMoney(0)],
        ]
      : [["Importe", pdfMoney(amounts.total)], ["Importe Otros Tributos", pdfMoney(0)]];
    pdf.note(note.reason || `Comprobante asociado a factura ${associated}.`);
    pdf.fiscalSummary(fiscalRows, "Importe Total", pdfMoney(amounts.total));
    pdf.fiscalAuthorizationBox(note.cae, note.cae_expires_at ? pdfDate(note.cae_expires_at) : "-", qrImage);
  });
}

export async function buildInternalSalesNotePdf(companyId: number, noteId: string) {
  const result = await queryWithCompanyContext<{
    id: string;
    class_name: "NC" | "ND";
    receipt_number: number;
    amount: string;
    detail_json: unknown;
    reason: string;
    issue_date: string;
    customer_name: string;
    customer_document: string;
    sale_number: string;
  }>(
    companyId,
    `
      SELECT sid.id::text,
             sid.class_name,
             COALESCE(sid.receipt_number, 0)::int AS receipt_number,
             COALESCE(sid.amount, 0)::text AS amount,
             sid.detail_json,
             COALESCE(sid.reason, '') AS reason,
             sid.issue_date::text,
             COALESCE(s.client_name, c.display_name, '') AS customer_name,
             COALESCE(s.client_document, c.tax_id, '') AS customer_document,
             COALESCE(s.sale_number, s.commercial_number::text, '') AS sale_number
      FROM sales_internal_documents sid
      LEFT JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE sid.id = $1::uuid
        AND sid.empresa_id = $2
        AND sid.fiscal = false
      LIMIT 1
    `,
    [noteId, companyId],
  );
  const note = result.rows[0];
  if (!note) throw new ApiError(404, "Nota interna no encontrada");
  const detail = asFiscalDetail(note.detail_json);
  if (!detail.length) throw new ApiError(409, "La nota interna no tiene detalle");

  const title = note.class_name === "NC" ? "Nota de credito interna" : "Nota de debito interna";
  const code = note.class_name;
  const number = String(note.receipt_number).padStart(8, "0");
  const total = Number(note.amount);
  return createPdfFile(`${note.class_name.toLowerCase()}_interna_${number}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title,
      code,
      number,
      date: pdfDate(note.issue_date),
      extra: [note.sale_number ? `Venta asociada: ${note.sale_number}` : ""].filter(Boolean),
      variant: "internal",
      footerLeft: "Documento interno no fiscal",
      footerRight: `Total ${pdfMoney(total)}`,
    });
    pdf.section("Cliente");
    pdf.title(note.customer_name || "Sin cliente", 12);
    pdf.muted(note.customer_document || "Sin CUIT/DNI");
    pdf.doc.y += 12;
    pdf.table(
      [
        { label: "Descripcion", width: 252 },
        { label: "Cant.", width: 64, align: "right" },
        { label: "Unitario", width: 94, align: "right" },
        { label: "Subtotal", width: 94, align: "right" },
      ],
      detail.map((item) => [
        item.name,
        pdfNumber(item.quantity),
        pdfMoney(item.unitPrice),
        pdfMoney(item.subtotal),
      ]),
    );
    pdf.totals([], "Total ajuste", pdfMoney(total));
    pdf.note(`Motivo: ${note.reason || "Sin detalle"}. Documento interno no valido como comprobante fiscal.`);
    pdf.signatures("Emitido por Starlim", "Conformidad / recepcion");
  });
}

export async function buildPurchaseOrderPdf(companyId: number, purchaseId: string) {
  const purchase = await getPurchase(companyId, purchaseId);
  const purchaseNumber = `OC-${String(purchase.id).slice(0, 8).toUpperCase()}`;
  const taxLabel = purchase.taxMode === "sin_iva" ? "Sin IVA" : `IVA ${purchase.vatRate}% incluido`;
  return createPdfFile(`orden_compra_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Orden de compra",
      code: "OC",
      number: purchaseNumber,
      date: pdfDate(purchase.date),
      extra: [`Estado: ${purchase.status}`, taxLabel],
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
  const taxLabel = purchase.taxMode === "sin_iva" ? "Sin IVA" : `IVA ${purchase.vatRate}% incluido`;
  return createPdfFile(`solicitud_devolucion_${purchaseId}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Solicitud de devolucion",
      code: "SD",
      number: returnNumber,
      date: pdfDate(localDateIso()),
      extra: [`Compra: ${String(purchase.id).slice(0, 8).toUpperCase()}`, `Estado: ${purchase.status}`, taxLabel],
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

export type PriceListPdfOptions = {
  listId: number;
  vigencia?: string;
  stock?: PriceListStock;
  groupBy?: PriceListGroupBy;
  filter?: string;
  iva?: PriceListVat;
};

export async function buildPriceListPdf(companyId: number, options: PriceListPdfOptions) {
  const stock = normalizeStock(options.stock);
  const groupBy = normalizeGroupBy(options.groupBy);
  const iva = normalizeVat(options.iva == null ? undefined : String(options.iva));
  const filter = (options.filter ?? "").trim().toLocaleLowerCase("es");
  const vigencia = options.vigencia && /^\d{4}-\d{2}-\d{2}$/.test(options.vigencia) ? options.vigencia : localDateIso();

  const listRow = await queryWithCompanyContext<{ id: number; nombre: string }>(
    companyId,
    `SELECT id, nombre FROM listas_precio WHERE empresa_id = $1 AND activa = 1 AND ($2 <= 0 OR id = $2) ORDER BY orden ASC, nombre ASC LIMIT 1`,
    [companyId, Number.isInteger(options.listId) ? options.listId : 0],
  );
  const selectedList = listRow.rows[0];
  if (!selectedList) throw new ApiError(404, "La lista de precios no existe");
  const listName = selectedList.nombre;

  const marginCode = productMarginCodeExpression("p");
  const result = await queryWithCompanyContext<{
    codigo: string;
    nombre: string;
    presentacion: string;
    categoria: string;
    proveedor: string;
    precio: string;
    stock_real: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS codigo,
             p.name AS nombre,
             COALESCE(p.unit, '') AS presentacion,
             COALESCE(NULLIF(p.category, ''), 'Sin categoría') AS categoria,
             COALESCE(NULLIF(s.display_name, ''), 'Sin proveedor') AS proveedor,
             COALESCE(
               NULLIF(ROUND(COALESCE(p.cost, 0) * NULLIF(ml.multiplicador, 1), 2), 0),
               NULLIF(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), 0),
               p.sale_price,
               p.cost,
               0
             ) AS precio,
             COALESCE(stock.stock_real, 0)::text AS stock_real
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      LEFT JOIN margenes m
        ON m.empresa_id = p.empresa_id AND m.codigo = ${marginCode}
      LEFT JOIN margenes_listas ml
        ON ml.empresa_id = p.empresa_id AND ml.lista_id = $2 AND ml.codigo = ${marginCode}
      LEFT JOIN LATERAL (
        SELECT SUM(
          CASE WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity ELSE -sm.quantity END
        ) AS stock_real
        FROM stock_movements sm
        WHERE sm.empresa_id = p.empresa_id AND sm.product_id = p.id
      ) stock ON true
      WHERE p.empresa_id = $1 AND p.active = true
      ORDER BY p.name ASC
    `,
    [companyId, selectedList.id],
  );

  const rows = result.rows.filter((row) => {
    if (Number(row.precio) <= 0) return false;
    if (stock === "con" && Number(row.stock_real) <= 0) return false;
    if (filter) {
      const groupValue = (groupBy === "proveedor" ? row.proveedor : row.categoria).toLocaleLowerCase("es");
      if (!groupValue.includes(filter)) return false;
    }
    return true;
  });

  // Agrupa preservando el orden alfabetico de los grupos.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = groupBy === "proveedor" ? row.proveedor : row.categoria;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  const orderedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));

  const ivaTag = iva === 10.5 ? "IVA 10,5% incluido" : "IVA 21% incluido";

  return createPdfFile(`lista_precios_${safeFilename(listName)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Lista de precios",
      code: "LP",
      number: listName,
      date: pdfDate(vigencia),
      extra: [ivaTag, `Productos: ${rows.length}`],
      footerLeft: "Lista de precios",
      footerRight: listName,
    });
    pdf.section("Lista vigente");
    pdf.title(listName, 13);
    pdf.muted(`Vigencia desde ${pdfDate(vigencia)}. ${vatLegend(iva)}`);
    pdf.doc.y += 12;

    if (orderedGroups.length === 0) {
      pdf.muted("No hay productos para los filtros seleccionados.");
    }

    for (const [groupName, groupRows] of orderedGroups) {
      pdf.section(groupName);
      pdf.table(
        [
          { label: "Codigo", width: 74 },
          { label: "Producto", width: 208 },
          { label: "Presentacion", width: 96 },
          { label: "Precio unit.", width: 126, align: "right" },
        ],
        groupRows.map((row) => [
          row.codigo || "-",
          row.nombre,
          row.presentacion || "-",
          pdfMoney(applyVat(Number(row.precio), iva)),
        ]),
        { minRowHeight: 20 },
      );
    }
    pdf.note("Documento informativo no fiscal. Verificar condiciones particulares, descuentos y disponibilidad antes de confirmar una operacion.");
  });
}

export async function buildOrderRequestPdf(companyId: number, orderId: string) {
  const order = await queryWithCompanyContext<{
    id: string;
    commercial_number: string | null;
    sale_number: string;
    receipt_number: number | null;
    delivery_number: number | null;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    estado_pedido: string;
    observacion: string;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             s.commercial_number::text AS commercial_number,
             COALESCE(s.sale_number, '') AS sale_number,
             s.receipt_number,
             dd.delivery_number,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             s.sale_date::text AS fecha,
             ${normalizedOrderStatusSql("s")} AS estado_pedido,
             COALESCE(s.notes, '') AS observacion
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [orderId, companyId],
  );
  const current = order.rows[0];
  if (!current) throw new ApiError(404, "Pedido no encontrado");
  const commercialCode = formatSaleCommercialCode({
    commercialNumber: current.commercial_number,
    saleNumber: current.sale_number,
    deliveryNumber: current.delivery_number,
    legacyRemittanceNumber: current.receipt_number,
  });

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

  return createPdfFile(`pedido_operativo_${safeFilename(commercialCode)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Pedido operativo",
      code: "PO",
      number: commercialCode === "Sin número" ? "PO sin número" : `PO-${commercialCode}`,
      date: pdfDate(current.fecha),
      extra: [`Estado: ${current.estado_pedido}`],
      variant: "internal",
      footerLeft: "Control de deposito - paso previo al armado",
      footerRight: "Uso interno",
    });
    pdf.section("Pedido");
    pdf.title(current.nombre_cliente || `Pedido ${commercialCode}`, 12);
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
    pdf.note("Documento operativo para control interno de stock y despacho. Marcar faltantes antes de avanzar el pedido.");
    pdf.signatures("Preparo deposito", "Controlo administracion");
  });
}

export async function buildOrderRemitoPdf(
  companyId: number,
  orderId: string,
  options: { includePrices?: boolean; copia?: boolean } = {},
) {
  const includePrices = options.includePrices ?? false;
  const copia = options.copia ?? false;

  const header = await queryWithCompanyContext<{
    commercial_number: string | null;
    sale_number: string;
    receipt_number: number | null;
    delivery_number: number | null;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    condicion_pago: string;
    monto: string;
    vendedor: string;
    domicilio: string;
    ciudad: string;
    provincia: string;
    nro_id: string;
    observacion: string;
    vat_rate: string;
    desired_document: string;
    receipt_type: number | null;
    fiscal_receipt_type: number | null;
  }>(
    companyId,
    `
      SELECT s.commercial_number::text AS commercial_number,
             COALESCE(s.sale_number, '') AS sale_number,
             s.receipt_number,
             dd.delivery_number,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             s.sale_date::text AS fecha,
             COALESCE(s.payment_condition, '') AS condicion_pago,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(s.vat_rate, 0)::text AS vat_rate,
             COALESCE(s.desired_document, '') AS desired_document,
             s.receipt_type,
             s.fiscal_receipt_type,
             COALESCE(s.seller_name, '') AS vendedor,
             COALESCE(c.delivery_address, c.address, '') AS domicilio,
             COALESCE(c.locality, '') AS ciudad,
             COALESCE(c.province, '') AS provincia,
             COALESCE(c.tax_id, s.client_document, '') AS nro_id,
             COALESCE(s.notes, '') AS observacion
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [orderId, companyId],
  );
  const order = header.rows[0];
  if (!order) throw new ApiError(404, "Pedido no encontrado");

  const detail = await queryWithCompanyContext<{
    product_code: string;
    nombre: string;
    cantidad: string;
    precio_unit: string;
    descuento: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(si.description, p.name, '(producto eliminado)') AS nombre,
             si.quantity::text AS cantidad,
             COALESCE(si.unit_price, 0)::text AS precio_unit,
             COALESCE(si.discount, 0)::text AS descuento,
             COALESCE(si.total_amount, 0)::text AS subtotal
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
      WHERE si.sale_id = $1::uuid AND si.empresa_id = $2
      ORDER BY si.id ASC
    `,
    [orderId, companyId],
  );

  const commercialCode = formatSaleCommercialCode({
    commercialNumber: order.commercial_number,
    saleNumber: order.sale_number,
    deliveryNumber: order.delivery_number,
    legacyRemittanceNumber: order.receipt_number,
  });
  const number = commercialCode === "Sin número" ? "Sin número" : commercialCode;
  const filenamePrefix = includePrices ? "remito_con_precios" : "remito_sin_precios";

  const vatRate = includePrices
    ? valuedPdfVatRate(order.vat_rate, {
        desiredDocument: order.desired_document,
        receiptType: order.receipt_type,
        fiscalReceiptType: order.fiscal_receipt_type,
      })
    : normalizeStoredVatRate(order.vat_rate);
  const totalUnits = detail.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
  const valuedLines = valuedDocumentLines(detail.rows.map((row) => ({
    quantity: Number(row.cantidad),
    unitPrice: Number(row.precio_unit),
    discountPercent: Number(row.descuento),
    netAmount: Number(row.subtotal),
  })), vatRate);
  const valuedSummary = valuedDocumentSummary(valuedLines);
  if (includePrices) assertValuedPdfTotal(Number(order.monto), valuedSummary.net, vatRate);
  const priceSummaryRows: [string, string][] = [
    ["Total de unidades", pdfNumber(totalUnits)],
    ["Subtotal neto", pdfMoney(valuedSummary.net)],
    [`IVA ${vatLabel(vatRate)}`, pdfMoney(valuedSummary.vat)],
  ];

  return createPdfFile(`${filenamePrefix}_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Remito",
      code: "R",
      number,
      date: pdfDate(order.fecha),
      extra: [includePrices ? "Documento valorizado" : "Control de mercaderia", copia ? "COPIA" : "ORIGINAL"],
      footerLeft: includePrices ? "Documento no valido como factura" : "Control de mercaderia - sin valores",
      footerRight: includePrices ? `Total final ${pdfMoney(valuedSummary.total)}` : "Deposito",
    });

    pdf.section("Destinatario");
    pdf.title(order.nombre_cliente || "Sin cliente", 11);
    pdf.muted(
      [
        order.domicilio,
        [order.ciudad, order.provincia].filter(Boolean).join(", "),
        `DNI/CUIT: ${order.nro_id || order.dni_cliente || "-"}`,
      ]
        .filter(Boolean)
        .join(" - "),
    );
    const infoY = pdf.y + 16;
    pdf.keyValue("Cond. vta.", order.condicion_pago || "-", 54, infoY, 74, 165);
    pdf.keyValue("Vendedor", order.vendedor || "-", 318, infoY, 64, 150);
    pdf.setY(infoY + 30);

    const columns = includePrices
      ? [
          { label: "Cant.", width: 30 },
          { label: "Codigo", width: 40 },
          { label: "Descripcion", width: 100 },
          { label: "P. lista neto", width: 58, align: "right" as const },
          { label: "Desc. %", width: 38, align: "right" as const },
          { label: "Unit. neto", width: 58, align: "right" as const },
          { label: "IVA %", width: 34, align: "center" as const },
          { label: "Unit. final", width: 62, align: "right" as const },
          { label: "Subtotal final", width: 75, align: "right" as const },
        ]
      : [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 78 },
          { label: "Descripcion", width: 312 },
          { label: "Control", width: 60, align: "center" as const },
        ];
    pdf.table(
      columns,
      detail.rows.map((row, index) =>
        includePrices
          ? [
              pdfNumber(Number(row.cantidad)),
              row.product_code,
              row.nombre,
              pdfMoney(Number(row.precio_unit)),
              Number(row.descuento) > 0 ? `${pdfNumber(Number(row.descuento))}%` : "-",
              pdfMoney(valuedLines[index].netUnitPrice),
              vatLabel(vatRate),
              pdfMoney(valuedLines[index].finalUnitPrice),
              pdfMoney(valuedLines[index].total),
            ]
          : [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, "[ ]"],
      ),
      includePrices ? { density: "compact" } : {},
    );
    pdf.totals(
      includePrices ? priceSummaryRows : [["Total de unidades", pdfNumber(totalUnits)]],
      includePrices ? "Total final" : "Control",
      includePrices ? pdfMoney(valuedSummary.total) : "",
    );
    pdf.note(order.observacion || "Verificar cantidades y estado de la mercaderia al momento de la recepcion.");
    pdf.signatures("Preparo / despacho", "Controlo / recibio");
  });
}
