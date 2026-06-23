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

const COLORS = {
  body: "#1f2421",
  muted: "#5b6661",
  soft: "#8a938c",
  line: "#e3e7e4",
  accent: "#1f3a60",
  accentSoft: "#eef2f8",
  danger: "#b91c1c",
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 42,
  marginTop: 40,
  marginBottom: 54,
  contentWidth: 511.28,
};

const CONTENT_BOTTOM = PAGE.height - PAGE.marginBottom - 36;
const FOOTER_Y = PAGE.height - PAGE.marginBottom - 16;

export type PdfBuildContext = {
  pdf: StarlimPdf;
};

export type PdfFile = {
  buffer: Buffer;
  filename: string;
};

export const companyInfo = {
  name: "Starlim S.A.S.",
  brand: "Starlim",
  cuit: "20-46656757-5",
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
  }) {
    const doc = this.doc;
    const top = PAGE.marginTop;
    const logo = logoData();

    if (logo) {
      doc.image(logo as unknown as Buffer, PAGE.marginX, top - 4, { width: 105 });
    } else {
      doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.accent).text(companyInfo.brand, PAGE.marginX, top);
    }

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.body);
    doc.text(`${companyInfo.name} - CUIT ${companyInfo.cuit}`, PAGE.marginX, top + 66, { width: 250 });
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
    doc.text(companyInfo.address, PAGE.marginX, top + 79, { width: 260 });
    doc.text(`${companyInfo.phone} - ${companyInfo.email}`, PAGE.marginX, top + 91, { width: 260 });

    const boxX = PAGE.width - PAGE.marginX - 178;
    doc.roundedRect(boxX, top, 178, 78, 6).strokeColor(COLORS.body).lineWidth(0.8).stroke();
    doc.font("Helvetica-Bold").fontSize(input.code.length > 2 ? 17 : 25).fillColor(COLORS.accent);
    doc.text(input.code, boxX + 12, top + 14, { width: 46, align: "center" });
    doc.font("Helvetica-Bold").fontSize(input.title.length > 22 ? 10 : 14).fillColor(COLORS.body);
    doc.text(input.title.toUpperCase(), boxX + 60, top + 13, { width: 104, align: "right" });
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
    doc.text(`Nro. ${input.number}`, boxX + 60, top + 43, { width: 104, align: "right" });
    doc.text(`Fecha ${input.date}`, boxX + 60, top + 56, { width: 104, align: "right" });

    if (input.extra?.length) {
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
      input.extra.slice(0, 3).forEach((line, index) => {
        doc.text(line, boxX, top + 84 + index * 12, { width: 178, align: "right" });
      });
    }

    const lineY = top + (input.extra?.length ? 126 : 112);
    doc.moveTo(PAGE.marginX, lineY).lineTo(PAGE.width - PAGE.marginX, lineY).strokeColor(COLORS.body).lineWidth(1.1).stroke();
    doc.y = lineY + 18;
  }

  section(title: string) {
    this.ensureSpace(18);
    this.doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.soft);
    this.doc.text(title.toUpperCase(), PAGE.marginX, this.doc.y, { width: PAGE.contentWidth });
    this.doc.y += 5;
    this.doc.fillColor(COLORS.body);
  }

  title(text: string, size = 12) {
    this.ensureSpace(size + 8);
    this.doc.font("Helvetica-Bold").fontSize(size).fillColor(COLORS.body);
    this.doc.text(text, PAGE.marginX, this.doc.y, { width: PAGE.contentWidth });
  }

  muted(text: string, options: { width?: number; align?: Align } = {}) {
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    this.doc.text(text, PAGE.marginX, this.doc.y, {
      width: options.width ?? PAGE.contentWidth,
      align: options.align ?? "left",
    });
    this.doc.fillColor(COLORS.body);
  }

  keyValue(label: string, value: string, x: number, y: number, labelWidth = 72, valueWidth = 180) {
    this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.soft);
    this.doc.text(label, x, y, { width: labelWidth });
    this.doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.body);
    this.doc.text(value || "-", x + labelWidth, y, { width: valueWidth });
  }

  infoBox(title: string, lines: string[], height = 74) {
    this.ensureSpace(height + 10);
    const y = this.doc.y;
    this.doc.roundedRect(PAGE.marginX, y, PAGE.contentWidth, height, 6).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    this.doc.y = y + 12;
    this.section(title);
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    this.doc.text(lines.filter(Boolean).join(" - ") || "-", PAGE.marginX + 14, this.doc.y, {
      width: PAGE.contentWidth - 28,
      lineGap: 2,
    });
    this.doc.y = y + height + 16;
  }

  table(columns: PdfTableColumn[], rows: PdfTableCell[][], options: { minRowHeight?: number } = {}) {
    const minRowHeight = options.minRowHeight ?? 24;
    const drawHeader = () => {
      this.ensureSpace(32);
      let x = PAGE.marginX;
      const y = this.doc.y;
      this.doc.rect(x, y, PAGE.contentWidth, 24).fill(COLORS.accent);
      this.doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");
      for (const column of columns) {
        this.doc.text(column.label.toUpperCase(), x + 5, y + 8, {
          width: column.width - 10,
          align: column.align ?? "left",
        });
        x += column.width;
      }
      this.doc.y = y + 24;
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

    for (const row of rows) {
      const heights = row.map((cell, index) => {
        const column = columns[index];
        return this.doc.heightOfString(safeText(cell), {
          width: column.width - 10,
          align: column.align ?? "left",
        });
      });
      const rowHeight = Math.max(minRowHeight, Math.max(...heights) + 14);
      if (this.doc.y + rowHeight > CONTENT_BOTTOM) {
        this.doc.addPage();
        drawHeader();
      }

      let x = PAGE.marginX;
      const y = this.doc.y;
      this.doc.font("Helvetica").fontSize(8.6).fillColor(COLORS.body);
      for (const [index, cell] of row.entries()) {
        const column = columns[index];
        this.doc.text(safeText(cell), x + 5, y + 7, {
          width: column.width - 10,
          align: column.align ?? "left",
          lineGap: 1.5,
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
    const width = 232;
    const x = PAGE.width - PAGE.marginX - width;
    this.ensureSpace(rows.length * 18 + 42);
    let y = this.doc.y;
    this.doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
    for (const [label, value] of rows) {
      this.doc.text(label, x, y, { width: 130 });
      this.doc.fillColor(COLORS.body).text(value, x + 130, y, { width: width - 130, align: "right" });
      this.doc.fillColor(COLORS.muted);
      y += 18;
    }
    this.doc.moveTo(x, y + 4).lineTo(x + width, y + 4).strokeColor(COLORS.body).lineWidth(1).stroke();
    this.doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.body);
    this.doc.text(finalLabel, x, y + 12, { width: 120 });
    this.doc.text(finalValue, x + 120, y + 12, { width: width - 120, align: "right" });
    this.doc.y = y + 46;
  }

  note(text: string) {
    this.ensureSpace(58);
    const y = this.doc.y;
    this.doc.roundedRect(PAGE.marginX, y, PAGE.contentWidth, 48, 6).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    this.doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
    this.doc.text(text, PAGE.marginX + 14, y + 12, { width: PAGE.contentWidth - 28, lineGap: 2 });
    this.doc.y = y + 62;
  }

  signatures(left: string, right: string) {
    const y = Math.max(this.doc.y + 24, PAGE.height - 124);
    if (y > PAGE.height - 86) {
      this.doc.addPage();
      this.doc.y = 88;
    }
    const finalY = Math.min(y, PAGE.height - 108);
    this.doc.moveTo(PAGE.marginX, finalY).lineTo(PAGE.marginX + 202, finalY).strokeColor(COLORS.body).lineWidth(0.7).stroke();
    this.doc.moveTo(PAGE.width - PAGE.marginX - 202, finalY).lineTo(PAGE.width - PAGE.marginX, finalY).stroke();
    this.doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
    this.doc.text(left, PAGE.marginX, finalY + 8, { width: 202, align: "center" });
    this.doc.text(right, PAGE.width - PAGE.marginX - 202, finalY + 8, { width: 202, align: "center" });
    this.doc.fillColor(COLORS.body);
  }

  addPageNumbers() {
    const range = this.doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      this.doc.switchToPage(index);
      this.doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.soft);
      this.doc.text("Starlim - documento operativo", PAGE.marginX, FOOTER_Y, {
        width: 240,
        align: "left",
        lineBreak: false,
      });
      this.doc.text(`Pagina ${index - range.start + 1} de ${range.count}`, PAGE.width - PAGE.marginX - 120, FOOTER_Y, {
        width: 120,
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
    size: "A4",
    margins: {
      top: PAGE.marginTop,
      bottom: PAGE.marginBottom,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
    bufferPages: true,
    info: {
      Producer: "StarLim Node PDF",
      Creator: "StarLim ERP",
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
