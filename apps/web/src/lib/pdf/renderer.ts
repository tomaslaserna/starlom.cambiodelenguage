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

const COLORS = {
  body: "#1f2421",
  muted: "#5b6661",
  soft: "#8a938c",
  line: "#ecefed",
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

  drawHeader(input: {
    title: string;
    code: string;
    number: string;
    date: string;
    extra?: string[];
    variant?: HeaderVariant;
    footerLeft?: string;
    footerRight?: string;
  }) {
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

  private drawBadge(title: string, code: string, number: string, date: string, x: number, y: number, width = 164) {
    this.doc.roundedRect(x, y, width, 78, 6).strokeColor(COLORS.body).lineWidth(1.2).stroke();
    this.doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.soft);
    this.doc.text(code, x + 12, y + 10, { width: 36, align: "left" });
    this.doc.font("Helvetica-Bold").fontSize(title.length > 18 ? 12 : 15).fillColor(COLORS.body);
    this.doc.text(headerTitle(title), x + 12, y + 21, { width: width - 24, align: "right", lineGap: 1 });
    this.doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
    this.doc.text(number, x + 12, y + 55, { width: width - 24, align: "right" });
    this.doc.text(date, x + 12, y + 66, { width: width - 24, align: "right" });
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
    const badgeX = PAGE.width - PAGE.marginX - 164;

    if (input.variant === "internal") {
      this.doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.soft);
      this.doc.text("DOCUMENTO INTERNO", PAGE.marginX, top + 5, { width: 220 });
      this.doc.font("Helvetica-Bold").fontSize(24).fillColor(COLORS.body);
      this.doc.text(input.title, PAGE.marginX, top + 20, { width: 280 });
    } else {
      this.drawLogo(PAGE.marginX, top, 42);
      this.drawCompanyBlock(PAGE.marginX, top + 52);
    }

    this.drawBadge(input.title, input.code, input.number, input.date, badgeX, top);

    if (input.extra?.length) {
      this.doc.font("Helvetica").fontSize(8.2).fillColor(COLORS.muted);
      input.extra.slice(0, 3).forEach((line, index) => {
        this.doc.text(line, badgeX, top + 88 + index * 11, { width: 164, align: "right" });
      });
    }

    const lineY = top + (input.extra?.length ? 128 : 106);
    this.doc.moveTo(PAGE.marginX, lineY).lineTo(PAGE.width - PAGE.marginX, lineY).strokeColor(COLORS.body).lineWidth(1.4).stroke();
    this.doc.y = lineY + 18;
  }

  private drawFiscalHeader(input: {
    title: string;
    code: string;
    number: string;
    date: string;
    extra?: string[];
  }) {
    const top = PAGE.marginTop;
    const height = 132;
    const tabWidth = 64;
    const tabX = PAGE.marginX + PAGE.contentWidth / 2 - tabWidth / 2;
    const letter = fiscalLetter(input.code, input.title);

    this.doc.roundedRect(PAGE.marginX, top, PAGE.contentWidth, height, 7).strokeColor(COLORS.body).lineWidth(1.3).stroke();
    this.doc.rect(tabX, top, tabWidth, 48).fillAndStroke(COLORS.white, COLORS.body);
    this.doc.font("Helvetica-Bold").fontSize(27).fillColor(COLORS.body).text(letter, tabX, top + 8, { width: tabWidth, align: "center" });
    this.doc.font("Helvetica").fontSize(7).fillColor(COLORS.muted).text("COD.", tabX, top + 35, { width: tabWidth, align: "center" });

    this.drawLogo(PAGE.marginX + 18, top + 18, 36);
    this.doc.font("Helvetica-Bold").fontSize(8.8).fillColor(COLORS.body);
    this.doc.text(companyInfo.name, PAGE.marginX + 18, top + 62, { width: 220 });
    this.drawCompanyBlock(PAGE.marginX + 18, top + 76, 235);

    const rightX = PAGE.marginX + PAGE.contentWidth - 220;
    this.doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.body);
    this.doc.text(fiscalDocumentName(input.title), rightX, top + 22, { width: 198, align: "right" });
    this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
    this.doc.text("Punto de venta / numero", rightX, top + 54, { width: 198, align: "right" });
    this.doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.body);
    this.doc.text(input.number, rightX, top + 66, { width: 198, align: "right" });
    this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
    this.doc.text(`Fecha ${input.date}`, rightX, top + 84, { width: 198, align: "right" });

    if (input.extra?.length) {
      this.doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      input.extra.slice(0, 3).forEach((line, index) => {
        this.doc.text(line, rightX, top + 100 + index * 10, { width: 198, align: "right" });
      });
    }

    this.doc.y = top + height + 18;
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
