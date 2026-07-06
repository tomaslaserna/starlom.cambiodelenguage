import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

type Align = "left" | "center" | "right";

export type PdfTableColumn = {
  label: string;
  width: number;
  align?: Align;
};

export type PdfTableCell = string | number | null | undefined;

type HeaderVariant = "standard" | "fiscal" | "internal";

type FiscalHeaderInput = {
  title: string;
  code: string;
  number: string;
  date: string;
  extra?: string[];
  variant?: HeaderVariant;
  footerLeft?: string;
  footerRight?: string;
  fiscalCode?: string;
  associatedDocument?: string;
};

const COLORS = {
  body: "#1f2421",
  muted: "#5b6661",
  soft: "#8a938c",
  line: "#ecefed",
  fiscalLine: "#353535",
  fiscalHeader: "#d9d9d9",
  accent: "#1f3a60",
  accentSoft: "#eef2f8",
  white: "#ffffff",
};

const PAGE = {
  width: 612,
  height: 792,
  marginX: 54,
  marginTop: 48,
  marginBottom: 58,
  contentWidth: 504,
};

const CONTENT_BOTTOM = PAGE.height - PAGE.marginBottom - 28;
const FOOTER_Y = PAGE.height - PAGE.marginBottom - 18;

export type PdfBuildContext = {
  pdf: StarlimPdf;
};

export type PdfFile = {
  buffer: Buffer;
  filename: string;
};

export const companyInfo = {
  name: "Starlimm S.A.S.",
  brand: "Starlim",
  cuit: "30-71888802-2",
  address: "Av. Argentina 1515, Villa Allende, Cordoba",
  phone: "+54 9 351 373-7820",
  email: "starlimmsas@gmail.com",
  iva: "Responsable Inscripto",
  grossIncome: "30-71888802-2",
  activityStart: "-",
};

function logoPath() {
  const candidate = join(process.cwd(), "public", "starlim-logo.png");
  return existsSync(candidate) ? candidate : "";
}

function logoData() {
  const path = logoPath();
  if (!path) return null;
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function safeText(value: PdfTableCell) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

function headerTitle(title: string) {
  return title
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fiscalLetter(code: string, title: string) {
  return code.match(/[ABC]$/i)?.[0]?.toUpperCase() ?? title.match(/\s([ABC])$/i)?.[1]?.toUpperCase() ?? code.slice(0, 1).toUpperCase();
}

function fiscalDocumentName(title: string) {
  return headerTitle(title.replace(/\s+[ABC]$/i, ""));
}

function fiscalPointOfSale(number: string) {
  const [pointOfSale] = number.split("-");
  return pointOfSale?.trim() || "-";
}

function fiscalReceiptOnly(number: string) {
  const [, receipt] = number.split("-");
  return receipt?.trim() || number;
}

export function pdfMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function pdfNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function pdfDate(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const raw = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR").format(date);
}

export function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 110);
}

export class StarlimPdf {
  doc: PDFKit.PDFDocument;
  private footerLeft = `${companyInfo.brand} - documento operativo`;
  private footerRight = "";

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
  }

  get y() {
    return this.doc.y;
  }

  setY(y: number) {
    this.doc.y = y;
  }

  ensureSpace(height: number) {
    if (this.doc.y + height > CONTENT_BOTTOM) {
      this.doc.addPage();
    }
  }

  drawHeader(input: FiscalHeaderInput) {
    this.footerLeft = input.footerLeft ?? `${input.title} ${input.number}`.trim();
    this.footerRight = input.footerRight ?? input.date;

    if (input.variant === "fiscal") {
      this.drawFiscalHeader(input);
      return;
    }

    this.drawStandardHeader(input);
  }

  private drawLogo(x: number, y: number, maxHeight = 42) {
    const logo = logoData();
    if (logo) {
      this.doc.image(logo as unknown as Buffer, x, y, { height: maxHeight });
      return;
    }
    this.doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.accent).text(companyInfo.brand, x, y);
  }

  private drawCompanyBlock(x: number, y: number, width = 250) {
    this.doc.font("Helvetica").fontSize(8.6).fillColor(COLORS.muted);
    this.doc.text(`${companyInfo.name} - CUIT ${companyInfo.cuit}`, x, y, { width });
    this.doc.text(companyInfo.address, x, y + 12, { width });
    this.doc.text(`${companyInfo.phone} - ${companyInfo.email}`, x, y + 24, { width });
  }

  private drawStandardHeader(input: {
    title: string;
    code: string;
    number: string;
    date: string;
    extra?: string[];
    variant?: HeaderVariant;
  }) {
    const top = PAGE.marginTop;

    if (input.variant === "internal") {
      this.doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.soft);
      this.doc.text("DOCUMENTO INTERNO", PAGE.marginX, top + 5, { width: 220 });
      this.doc.font("Helvetica-Bold").fontSize(24).fillColor(COLORS.body);
      this.doc.text(input.title, PAGE.marginX, top + 20, { width: 280 });
      this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
      this.doc.text(`Nro. ${input.number}`, PAGE.width - PAGE.marginX - 190, top + 20, { width: 190, align: "right" });
      this.doc.text(`Fecha ${input.date}`, PAGE.width - PAGE.marginX - 190, top + 34, { width: 190, align: "right" });
    } else {
      this.drawLogo(PAGE.marginX, top, 42);
      this.drawCompanyBlock(PAGE.marginX, top + 52);

      const rightX = PAGE.width - PAGE.marginX - 218;
      const boxedTitle = !["Presupuesto", "Lista de precios", "Cuenta corriente"].includes(input.title);
      if (boxedTitle) {
        const boxWidth = Math.min(176, Math.max(128, input.title.length * 7.3));
        const boxX = PAGE.width - PAGE.marginX - boxWidth;
        this.doc.roundedRect(boxX, top + 3, boxWidth, 48, 6).strokeColor(COLORS.body).lineWidth(1.3).stroke();
        this.doc.font("Helvetica-Bold").fontSize(input.title.length > 18 ? 14 : 18).fillColor(COLORS.body);
        this.doc.text(headerTitle(input.title), boxX + 10, top + 12, { width: boxWidth - 20, align: "center", lineGap: 1 });
        this.doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.soft);
        this.doc.text(input.code, boxX + 10, top + 34, { width: boxWidth - 20, align: "center" });
      } else {
        this.doc.font("Helvetica-Bold").fontSize(23).fillColor(COLORS.body);
        this.doc.text(input.title, rightX, top + 4, { width: 218, align: "right" });
      }
      this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
      this.doc.text(`Nro. ${input.number}`, rightX, top + 60, { width: 218, align: "right" });
      this.doc.text(`Fecha ${input.date}`, rightX, top + 74, { width: 218, align: "right" });
      input.extra?.slice(0, 2).forEach((line, index) => {
        this.doc.text(line, rightX, top + 88 + index * 12, { width: 218, align: "right" });
      });
    }

    const lineY = top + (input.extra?.length ? 124 : 110);
    this.doc.moveTo(PAGE.marginX, lineY).lineTo(PAGE.width - PAGE.marginX, lineY).strokeColor(COLORS.body).lineWidth(1.4).stroke();
    this.doc.y = lineY + 18;
  }

  private drawFiscalHeader(input: FiscalHeaderInput) {
    const top = PAGE.marginTop;
    const height = 206;
    const topBandHeight = 30;
    const mainTop = top + topBandHeight;
    const mainHeight = 146;
    const periodTop = mainTop + mainHeight;
    const leftWidth = PAGE.contentWidth / 2;
    const letterWidth = 50;
    const letterX = PAGE.marginX + leftWidth - letterWidth / 2;
    const rightX = PAGE.marginX + leftWidth;
    const letter = fiscalLetter(input.code, input.title);

    this.doc.rect(PAGE.marginX, top, PAGE.contentWidth, height).strokeColor(COLORS.fiscalLine).lineWidth(1.1).stroke();
    this.doc.moveTo(PAGE.marginX, mainTop).lineTo(PAGE.width - PAGE.marginX, mainTop).stroke();
    this.doc.moveTo(PAGE.marginX + leftWidth, mainTop).lineTo(PAGE.marginX + leftWidth, periodTop).stroke();
    this.doc.moveTo(PAGE.marginX, periodTop).lineTo(PAGE.width - PAGE.marginX, periodTop).stroke();

    this.doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.body);
    this.doc.text("ORIGINAL", PAGE.marginX, top + 9, { width: PAGE.contentWidth, align: "center" });

    this.doc.rect(letterX, mainTop, letterWidth, 54).fillAndStroke(COLORS.white, COLORS.fiscalLine);
    this.doc.font("Helvetica-Bold").fontSize(28).fillColor(COLORS.body).text(letter, letterX, mainTop + 7, { width: letterWidth, align: "center" });
    this.doc.font("Helvetica").fontSize(7.2).fillColor(COLORS.body).text(`COD. ${input.fiscalCode || "-"}`, letterX, mainTop + 38, {
      width: letterWidth,
      align: "center",
    });

    this.doc.save();
    this.doc.rect(PAGE.marginX + 1, mainTop + 1, leftWidth - 3, mainHeight - 2).clip();
    this.drawLogo(PAGE.marginX + 14, mainTop + 16, 34);
    this.doc.font("Helvetica-Bold").fontSize(8.7).fillColor(COLORS.body);
    this.doc.text(`Razon Social: ${companyInfo.name}`, PAGE.marginX + 14, mainTop + 62, { width: leftWidth - 28 });
    this.doc.font("Helvetica-Bold").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text("Domicilio Comercial:", PAGE.marginX + 14, mainTop + 80, { width: 84 });
    this.doc.font("Helvetica").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text(companyInfo.address, PAGE.marginX + 102, mainTop + 80, { width: leftWidth - 116 });
    this.doc.font("Helvetica-Bold").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text("Condicion frente al IVA:", PAGE.marginX + 14, mainTop + 99, { width: 102 });
    this.doc.font("Helvetica").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text(companyInfo.iva, PAGE.marginX + 118, mainTop + 99, { width: leftWidth - 132 });
    this.doc.restore();

    this.doc.font("Helvetica-Bold").fontSize(19).fillColor(COLORS.body);
    this.doc.text(fiscalDocumentName(input.title), rightX + 62, mainTop + 18, { width: leftWidth - 76 });
    this.fiscalHeaderPair("Punto de Venta:", fiscalPointOfSale(input.number), rightX + 62, mainTop + 50);
    this.fiscalHeaderPair("Comp. Nro:", fiscalReceiptOnly(input.number), rightX + 62, mainTop + 66);
    this.fiscalHeaderPair("Fecha de Emision:", input.date, rightX + 62, mainTop + 82);
    this.fiscalHeaderPair("CUIT:", companyInfo.cuit, rightX + 62, mainTop + 99);

    this.fiscalHeaderPair("Ingresos Brutos:", companyInfo.grossIncome, rightX + 62, mainTop + 114);
    this.fiscalHeaderPair("Inicio Actividades:", companyInfo.activityStart, rightX + 62, mainTop + 129);

    const period = input.extra?.find((line) => line.toLowerCase().includes("periodo"))?.split(":").slice(1).join(":").trim();
    const paymentDue = input.extra?.find((line) => line.toLowerCase().includes("vto"))?.split(":").slice(1).join(":").trim();
    this.doc.font("Helvetica-Bold").fontSize(8.6).fillColor(COLORS.body);
    this.doc.text("Periodo Facturado Desde:", PAGE.marginX + 8, periodTop + 9, { width: 116 });
    this.doc.font("Helvetica").fontSize(8.6).text(period || input.date, PAGE.marginX + 126, periodTop + 9, { width: 96 });
    this.doc.font("Helvetica-Bold").fontSize(8.6).text("Hasta:", PAGE.marginX + 220, periodTop + 9, { width: 48 });
    this.doc.font("Helvetica").fontSize(8.6).text(period || input.date, PAGE.marginX + 268, periodTop + 9, { width: 96 });
    this.doc.font("Helvetica-Bold").fontSize(8.6).text("Fecha de Vto. para el pago:", PAGE.marginX + 332, periodTop + 9, { width: 116 });
    this.doc.font("Helvetica").fontSize(8.6).text(paymentDue || input.date, PAGE.marginX + 450, periodTop + 9, { width: 48 });

    this.doc.y = top + height + 12;
  }

  private fiscalHeaderPair(label: string, value: string, x: number, y: number) {
    this.doc.font("Helvetica-Bold").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text(label, x, y, { width: 86 });
    this.doc.font("Helvetica").fontSize(8.3).fillColor(COLORS.body);
    this.doc.text(value || "-", x + 88, y, { width: 112 });
  }

  section(title: string) {
    this.ensureSpace(22);
    this.doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.soft);
    this.doc.text(headerTitle(title), PAGE.marginX, this.doc.y, { width: PAGE.contentWidth });
    this.doc.y += 8;
    this.doc.fillColor(COLORS.body);
  }

  title(text: string, size = 12) {
    this.ensureSpace(size + 8);
    this.doc.font("Helvetica-Bold").fontSize(size).fillColor(COLORS.body);
    this.doc.text(text, PAGE.marginX, this.doc.y, { width: PAGE.contentWidth, lineGap: 1 });
  }

  muted(text: string, options: { width?: number; align?: Align } = {}) {
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    this.doc.text(text, PAGE.marginX, this.doc.y, {
      width: options.width ?? PAGE.contentWidth,
      align: options.align ?? "left",
      lineGap: 1.4,
    });
    this.doc.fillColor(COLORS.body);
  }

  keyValue(label: string, value: string, x: number, y: number, labelWidth = 72, valueWidth = 180) {
    this.doc.font("Helvetica").fontSize(8.3).fillColor(COLORS.soft);
    this.doc.text(label, x, y, { width: labelWidth });
    this.doc.font("Helvetica-Bold").fontSize(8.4).fillColor(COLORS.body);
    this.doc.text(value || "-", x + labelWidth, y, { width: valueWidth });
  }

  fiscalClientBox(input: {
    name: string;
    document: string;
    ivaCondition?: string;
    address?: string;
    saleCondition?: string;
    associatedDocument?: string;
  }) {
    this.ensureSpace(82);
    const y = this.doc.y;
    const height = input.associatedDocument ? 78 : 64;
    this.doc.rect(PAGE.marginX, y, PAGE.contentWidth, height).strokeColor(COLORS.fiscalLine).lineWidth(0.9).stroke();
    this.fiscalBoxPair("CUIT:", input.document || "-", PAGE.marginX + 8, y + 10, 58, 150);
    this.fiscalBoxPair("Apellido y Nombre / Razon Social:", input.name || "-", PAGE.marginX + 222, y + 10, 138, 138);
    this.fiscalBoxPair("Condicion frente al IVA:", input.ivaCondition || "-", PAGE.marginX + 8, y + 30, 96, 132);
    this.fiscalBoxPair("Domicilio Comercial:", input.address || "-", PAGE.marginX + 222, y + 30, 88, 188);
    this.fiscalBoxPair("Condicion de venta:", input.saleCondition || "-", PAGE.marginX + 8, y + 50, 84, 132);
    if (input.associatedDocument) {
      this.fiscalBoxPair("Comprobante asociado:", input.associatedDocument, PAGE.marginX + 222, y + 50, 102, 174);
    }
    this.doc.y = y + height + 10;
  }

  fiscalItemsTable(rows: Array<{
    code?: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discount?: string;
    vatRate?: string;
    subtotal: string;
  }>) {
    const columns = [
      { label: "Codigo", width: 38, align: "left" as const },
      { label: "Producto / Servicio", width: 168, align: "left" as const },
      { label: "Cantidad", width: 44, align: "right" as const },
      { label: "U. medida", width: 48, align: "center" as const },
      { label: "Precio Unit.", width: 64, align: "right" as const },
      { label: "% Bonif", width: 42, align: "right" as const },
      { label: "Alic. IVA", width: 38, align: "center" as const },
      { label: "Subtotal c/IVA", width: 62, align: "right" as const },
    ];
    const drawHeader = () => {
      this.ensureSpace(32);
      const y = this.doc.y;
      this.doc.rect(PAGE.marginX, y, PAGE.contentWidth, 24).fillAndStroke(COLORS.fiscalHeader, COLORS.fiscalLine);
      let x = PAGE.marginX;
      this.doc.font("Helvetica-Bold").fontSize(6.6).fillColor(COLORS.body);
      for (const column of columns) {
        this.doc.text(column.label, x + 3, y + 8, { width: column.width - 6, align: column.align });
        this.doc.moveTo(x + column.width, y).lineTo(x + column.width, y + 24).strokeColor(COLORS.fiscalLine).lineWidth(0.45).stroke();
        x += column.width;
      }
      this.doc.y = y + 24;
    };

    drawHeader();
    const data = rows.length
      ? rows
      : [{ description: "Sin items", quantity: "-", unit: "-", unitPrice: "-", subtotal: "-", code: "-", discount: "-", vatRate: "-" }];
    this.doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.body);
    for (const row of data) {
      const values = [
        row.code || "-",
        row.description,
        row.quantity,
        row.unit,
        row.unitPrice,
        row.discount || "0,00",
        row.vatRate || "-",
        row.subtotal,
      ];
      const heights = values.map((value, index) =>
        this.doc.heightOfString(value, { width: columns[index].width - 6, align: columns[index].align, lineGap: 1 }),
      );
      const rowHeight = Math.max(26, Math.max(...heights) + 12);
      if (this.doc.y + rowHeight > CONTENT_BOTTOM) {
        this.doc.addPage();
        drawHeader();
      }

      const y = this.doc.y;
      let x = PAGE.marginX;
      values.forEach((value, index) => {
        const column = columns[index];
        this.doc.text(value, x + 3, y + 7, { width: column.width - 6, align: column.align, lineGap: 1 });
        x += column.width;
      });
      this.doc.moveTo(PAGE.marginX, y + rowHeight).lineTo(PAGE.width - PAGE.marginX, y + rowHeight).strokeColor(COLORS.line).lineWidth(0.7).stroke();
      this.doc.y = y + rowHeight;
    }
    this.doc.y += 12;
  }

  fiscalSummary(rows: [string, string][], finalLabel: string, finalValue: string): void {
    const height = 150;
    this.ensureSpace(height + 8);
    const y = this.doc.y + 8;
    if (y + height > CONTENT_BOTTOM) {
      this.doc.addPage();
      this.doc.y = PAGE.marginTop;
      this.fiscalSummary(rows, finalLabel, finalValue);
      return;
    }

    this.doc.rect(PAGE.marginX, y, PAGE.contentWidth, height).strokeColor(COLORS.fiscalLine).lineWidth(1).stroke();
    this.doc.rect(PAGE.marginX, y + 18, 288, 18).fillAndStroke(COLORS.fiscalHeader, COLORS.fiscalLine);
    this.doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.body);
    this.doc.text("Otros Tributos", PAGE.marginX + 6, y + 6, { width: 120 });
    this.doc.text("Descripcion", PAGE.marginX + 6, y + 24, { width: 120 });
    this.doc.text("Detalle", PAGE.marginX + 126, y + 24, { width: 82 });
    this.doc.text("Alic. %", PAGE.marginX + 210, y + 24, { width: 36, align: "right" });
    this.doc.text("Importe", PAGE.marginX + 248, y + 24, { width: 40, align: "right" });
    const tributes = ["Per./Ret. de Impuesto a las Ganancias", "Per./Ret. de IVA", "Per./Ret. Ingresos Brutos", "Impuestos Internos", "Impuestos Municipales"];
    tributes.forEach((label, index) => {
      const rowY = y + 42 + index * 12;
      this.doc.text(label, PAGE.marginX + 6, rowY, { width: 194 });
      this.doc.text("0,00", PAGE.marginX + 248, rowY, { width: 40, align: "right" });
    });
    this.doc.text("Importe Otros Tributos: $", PAGE.marginX + 150, y + 106, { width: 100, align: "right" });
    this.doc.text("0,00", PAGE.marginX + 248, y + 106, { width: 40, align: "right" });

    const totalsX = PAGE.marginX + 292;
    let totalY = y + 42;
    this.doc.font("Helvetica-Bold").fontSize(7.6).fillColor(COLORS.body);
    for (const [label, value] of rows) {
      this.doc.text(`${label}:`, totalsX, totalY, { width: 126, align: "right" });
      this.doc.text(value, totalsX + 132, totalY, { width: 78, align: "right" });
      totalY += 11;
    }
    this.doc.font("Helvetica-Bold").fontSize(10.5);
    this.doc.text(`${finalLabel}:`, totalsX, y + 132, { width: 126, align: "right" });
    this.doc.text(finalValue, totalsX + 132, y + 132, { width: 78, align: "right" });
    this.doc.y = y + height + 14;
  }

  fiscalAuthorizationBox(cae: string, caeExpiresAt: string, qrImage?: ArrayBuffer) {
    this.ensureSpace(74);
    const y = this.doc.y;
    this.doc.moveTo(PAGE.marginX, y).lineTo(PAGE.width - PAGE.marginX, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    const qrSize = 58;
    const qrX = PAGE.marginX;
    const qrY = y + 14;
    if (qrImage) {
      this.doc.image(qrImage as unknown as Buffer, qrX, qrY, { width: qrSize, height: qrSize });
    } else {
      this.doc.rect(qrX, qrY, qrSize, qrSize).strokeColor(COLORS.fiscalLine).lineWidth(0.8).stroke();
      this.doc.font("Helvetica-Bold").fontSize(16).fillColor(COLORS.body).text("QR", qrX, qrY + 20, { width: qrSize, align: "center" });
    }
    this.doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.body);
    this.doc.text("COMPROBANTE AUTORIZADO", qrX + qrSize + 16, qrY + 4, { width: 240 });
    this.doc.font("Helvetica").fontSize(8.6).fillColor(COLORS.muted);
    this.doc.text(`CAE Nro.: ${cae || "-"}`, qrX + qrSize + 16, qrY + 20, { width: 260 });
    this.doc.text(`Fecha de vto. del CAE: ${caeExpiresAt || "-"}`, qrX + qrSize + 16, qrY + 34, { width: 260 });
    this.doc.text("Agencia de Recaudacion y Control Aduanero (ARCA)", qrX + qrSize + 16, qrY + 48, { width: 300 });
    this.doc.y = y + 86;
  }

  private fiscalBoxPair(label: string, value: string, x: number, y: number, labelWidth: number, valueWidth: number) {
    this.doc.font("Helvetica-Bold").fontSize(8.1).fillColor(COLORS.body);
    this.doc.text(label, x, y, { width: labelWidth });
    this.doc.font("Helvetica").fontSize(8.1).fillColor(COLORS.body);
    this.doc.text(value || "-", x + labelWidth, y, { width: valueWidth });
  }

  infoBox(title: string, lines: string[], height = 70) {
    this.ensureSpace(height + 10);
    const y = this.doc.y;
    this.doc.moveTo(PAGE.marginX, y).lineTo(PAGE.width - PAGE.marginX, y).strokeColor(COLORS.body).lineWidth(0.9).stroke();
    this.doc.y = y + 12;
    this.section(title);
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    this.doc.text(lines.filter(Boolean).join(" - ") || "-", PAGE.marginX, this.doc.y, {
      width: PAGE.contentWidth,
      lineGap: 2,
    });
    this.doc.y = y + height + 12;
  }

  table(columns: PdfTableColumn[], rows: PdfTableCell[][], options: { minRowHeight?: number; accentHeader?: boolean } = {}) {
    const minRowHeight = options.minRowHeight ?? 24;
    const drawHeader = () => {
      this.ensureSpace(32);
      let x = PAGE.marginX;
      const y = this.doc.y;

      if (options.accentHeader) {
        this.doc.rect(PAGE.marginX, y, PAGE.contentWidth, 25).fill(COLORS.accent);
        this.doc.fillColor(COLORS.white);
      } else {
        this.doc.moveTo(PAGE.marginX, y + 24).lineTo(PAGE.width - PAGE.marginX, y + 24).strokeColor(COLORS.body).lineWidth(1.3).stroke();
        this.doc.fillColor(COLORS.muted);
      }

      this.doc.font("Helvetica-Bold").fontSize(7.5);
      for (const column of columns) {
        this.doc.text(headerTitle(column.label), x + 5, y + 8, {
          width: column.width - 10,
          align: column.align ?? "left",
        });
        x += column.width;
      }
      this.doc.y = y + 25;
      this.doc.fillColor(COLORS.body);
    };

    drawHeader();

    if (!rows.length) {
      this.doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLORS.muted);
      this.doc.text("Sin datos para mostrar.", PAGE.marginX, this.doc.y + 12, {
        width: PAGE.contentWidth,
        align: "center",
      });
      this.doc.y += 42;
      return;
    }

    this.doc.font("Helvetica").fontSize(8.8).fillColor(COLORS.body);
    for (const row of rows) {
      const heights = row.map((cell, index) => {
        const column = columns[index];
        return this.doc.heightOfString(safeText(cell), {
          width: column.width - 10,
          align: column.align ?? "left",
          lineGap: 1.3,
        });
      });
      const rowHeight = Math.max(minRowHeight, Math.max(...heights) + 15);
      if (this.doc.y + rowHeight > CONTENT_BOTTOM) {
        this.doc.addPage();
        drawHeader();
      }

      let x = PAGE.marginX;
      const y = this.doc.y;
      this.doc.font("Helvetica").fontSize(8.7).fillColor(COLORS.body);
      for (const [index, cell] of row.entries()) {
        const column = columns[index];
        this.doc.text(safeText(cell), x + 5, y + 8, {
          width: column.width - 10,
          align: column.align ?? "left",
          lineGap: 1.3,
        });
        x += column.width;
      }
      this.doc.moveTo(PAGE.marginX, y + rowHeight)
        .lineTo(PAGE.width - PAGE.marginX, y + rowHeight)
        .strokeColor(COLORS.line)
        .lineWidth(0.7)
        .stroke();
      this.doc.y = y + rowHeight;
    }
    this.doc.y += 14;
  }

  totals(rows: [string, string][], finalLabel: string, finalValue: string) {
    const width = 238;
    const x = PAGE.width - PAGE.marginX - width;
    this.ensureSpace(rows.length * 18 + 42);
    let y = this.doc.y;
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    for (const [label, value] of rows) {
      this.doc.text(label, x, y, { width: 132 });
      this.doc.fillColor(COLORS.body).text(value, x + 132, y, { width: width - 132, align: "right" });
      this.doc.fillColor(COLORS.muted);
      y += 17;
    }
    this.doc.moveTo(x, y + 4).lineTo(x + width, y + 4).strokeColor(COLORS.body).lineWidth(1.4).stroke();
    this.doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.body);
    this.doc.text(finalLabel, x, y + 12, { width: 118 });
    this.doc.text(finalValue, x + 118, y + 12, { width: width - 118, align: "right" });
    this.doc.y = y + 46;
  }

  note(text: string) {
    this.ensureSpace(62);
    const y = this.doc.y;
    this.doc.moveTo(PAGE.marginX, y).lineTo(PAGE.width - PAGE.marginX, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    this.doc.font("Helvetica").fontSize(8.6).fillColor(COLORS.muted);
    this.doc.text(text, PAGE.marginX, y + 12, { width: PAGE.contentWidth, lineGap: 2 });
    this.doc.y = y + 58;
  }

  signatures(left: string, right: string) {
    const y = Math.max(this.doc.y + 26, PAGE.height - 128);
    if (y > PAGE.height - 90) {
      this.doc.addPage();
      this.doc.y = 88;
    }
    const finalY = Math.min(y, PAGE.height - 112);
    this.doc.moveTo(PAGE.marginX, finalY).lineTo(PAGE.marginX + 210, finalY).strokeColor(COLORS.body).lineWidth(0.7).stroke();
    this.doc.moveTo(PAGE.width - PAGE.marginX - 210, finalY).lineTo(PAGE.width - PAGE.marginX, finalY).stroke();
    this.doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
    this.doc.text(left, PAGE.marginX, finalY + 8, { width: 210, align: "center" });
    this.doc.text(right, PAGE.width - PAGE.marginX - 210, finalY + 8, { width: 210, align: "center" });
    this.doc.fillColor(COLORS.body);
  }

  addPageNumbers() {
    const range = this.doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      this.doc.switchToPage(index);
      this.doc.font("Helvetica").fontSize(7.2).fillColor(COLORS.soft);
      this.doc.text(headerTitle(this.footerLeft), PAGE.marginX, FOOTER_Y, {
        width: 280,
        height: 10,
        align: "left",
        lineBreak: false,
      });
      const right = [this.footerRight, `Pagina ${index - range.start + 1} de ${range.count}`].filter(Boolean).join(" - ");
      this.doc.text(right, PAGE.width - PAGE.marginX - 220, FOOTER_Y, {
        width: 220,
        height: 10,
        align: "right",
        lineBreak: false,
      });
    }
  }
}

export async function createPdfFile(
  filename: string,
  build: (context: PdfBuildContext) => Promise<void> | void,
): Promise<PdfFile> {
  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: PAGE.marginTop,
      bottom: PAGE.marginBottom,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
    bufferPages: true,
    info: {
      Producer: "Starlim PDF",
      Creator: "Starlim ERP",
    },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pdf = new StarlimPdf(doc);
  await build({ pdf });
  pdf.addPageNumbers();
  doc.end();
  return { buffer: await finished, filename };
}

export function pdfResponse(file: PdfFile, inline = true) {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.buffer.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
