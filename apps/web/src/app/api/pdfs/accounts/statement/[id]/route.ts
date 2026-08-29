import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { getCustomerStatement } from "@/lib/customer-accounts";
import {
  createPdfFile,
  pdfDate,
  pdfMoney,
  pdfResponse,
  safeFilename,
  type PdfTableCell,
} from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function dateRangeLabel(from: string, to: string) {
  if (!from && !to) return "Completo";
  return `${from ? pdfDate(from) : "inicio"} a ${to ? pdfDate(to) : "hoy"}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([COLLECTIONS_READ_PERMISSION]);
    const { id } = await context.params;
    const clientId = uuidParam(id, "Cliente");
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";

    const { customer, statement } = await getCustomerStatement(session.companyId, clientId, { from, to });

    const filename = `estado_cuenta_${safeFilename(customer.name) || "cliente"}_${localDateIso()}.pdf`;
    const file = await createPdfFile(filename, ({ pdf }) => {
      pdf.drawHeader({
        title: "Estado de cuenta",
        code: "EC",
        number: `EC-${localDateIso().replaceAll("-", "")}`,
        date: pdfDate(localDateIso()),
        extra: [customer.taxId ? `CUIT ${customer.taxId}` : "", `Periodo: ${dateRangeLabel(from, to)}`].filter(Boolean),
        footerLeft: `Estado de cuenta - ${customer.name || "Cliente"}`,
        footerRight: dateRangeLabel(from, to),
        continuationSubject: customer.name || "Cliente",
      });

      pdf.section("Cliente");
      pdf.title(customer.name || "Sin cliente", 12);
      pdf.muted(
        [
          customer.taxId ? `CUIT ${customer.taxId}` : "",
          customer.sellerName ? `Vendedor: ${customer.sellerName}` : "",
          `Periodo: ${dateRangeLabel(from, to)}`,
        ]
          .filter(Boolean)
          .join(" - "),
      );
      pdf.doc.y += 14;

      const rows: PdfTableCell[][] = [
        [from ? pdfDate(from) : "-", "Saldo anterior", "-", "-", pdfMoney(statement.openingBalance)],
      ];
      for (const line of statement.lines) {
        rows.push([
          pdfDate(line.date),
          line.description || "Movimiento de cuenta corriente",
          line.debit > 0 ? pdfMoney(line.debit) : "-",
          line.credit > 0 ? pdfMoney(line.credit) : "-",
          pdfMoney(line.balance),
        ]);
      }

      pdf.table(
        [
          { label: "Fecha", width: 70, align: "center" },
          { label: "Comprobante / Detalle", width: 236 },
          { label: "Debe", width: 66, align: "right" },
          { label: "Haber", width: 66, align: "right" },
          { label: "Saldo", width: 66, align: "right" },
        ],
        rows,
      );

      const totalDebit = statement.lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = statement.lines.reduce((sum, line) => sum + line.credit, 0);
      pdf.totals(
        [
          ["Saldo anterior", pdfMoney(statement.openingBalance)],
          ["Total debe", pdfMoney(totalDebit)],
          ["Total haber", pdfMoney(totalCredit)],
        ],
        Math.abs(statement.finalBalance) <= 0.0001
          ? "Cuenta saldada"
          : statement.finalBalance > 0
            ? "Saldo pendiente"
            : "Saldo a favor",
        pdfMoney(statement.finalBalance),
      );
      pdf.note("Este estado refleja los movimientos registrados en Starlim para el cliente y el periodo indicados.");
    });

    return pdfResponse(file, searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
