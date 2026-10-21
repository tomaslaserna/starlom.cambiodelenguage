import type { CustomerStatementResult } from "@/lib/customer-accounts";
import { statementSinceLastZero } from "@/lib/customer-statement-presentation";
import {
  createPdfFile,
  pdfDate,
  pdfMoney,
  safeFilename,
  type PdfTableCell,
} from "@/lib/pdf/renderer";
import { localDateIso } from "@/lib/timezone";

function dateRangeLabel(from: string, to: string) {
  if (!from && !to) return "Completo";
  return `${from ? pdfDate(from) : "inicio"} a ${to ? pdfDate(to) : "hoy"}`;
}

// Same traditional document for staff and portal; authorization belongs to each caller.
export async function buildCustomerStatementPdf(result: CustomerStatementResult, searchParams: URLSearchParams) {
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";

    const completeHistory = searchParams.get("history") === "completo";
    const compactView = !from && !to && !completeHistory;
    const { customer } = result;
    const currentPeriod = compactView ? statementSinceLastZero(result.statement) : null;
    const statement = currentPeriod?.statement ?? result.statement;
    const periodLabel = currentPeriod
      ? currentPeriod.lastZeroDate ? `Desde ultimo saldo cero: ${pdfDate(currentPeriod.lastZeroDate)}` : "Desde inicio (sin cierres previos)"
      : dateRangeLabel(from, to);
    const scope = compactView ? "actual" : from || to ? "periodo" : "completo";

    const filename = `estado_cuenta_${safeFilename(customer.name) || "cliente"}_${scope}_${localDateIso()}.pdf`;
    const file = await createPdfFile(filename, ({ pdf }) => {
      pdf.drawHeader({
        title: "Estado de cuenta",
        code: "EC",
        number: `EC-${localDateIso().replaceAll("-", "")}`,
        date: pdfDate(localDateIso()),
        extra: [customer.taxId ? `CUIT ${customer.taxId}` : "", `Periodo: ${periodLabel}`].filter(Boolean),
        footerLeft: `Estado de cuenta - ${customer.name || "Cliente"}`,
        footerRight: periodLabel,
        continuationSubject: customer.name || "Cliente",
      });

      pdf.section("Cliente");
      pdf.title(customer.name || "Sin cliente", 12);
      pdf.muted(
        [
          customer.taxId ? `CUIT ${customer.taxId}` : "",
          customer.sellerName ? `Vendedor: ${customer.sellerName}` : "",
          `Periodo: ${periodLabel}`,
        ]
          .filter(Boolean)
          .join(" - "),
      );
      pdf.doc.y += 14;
      if (currentPeriod?.hiddenCount) {
        pdf.muted(statement.lines.length === 0
          ? "Cuenta al dia. No hay movimientos posteriores al ultimo saldo cero."
          : "Se muestran unicamente los movimientos posteriores al ultimo saldo cero.");
        pdf.doc.y += 10;
      }

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

    return file;
}
