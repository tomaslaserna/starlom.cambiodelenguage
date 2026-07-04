export type CollectionOrderInput = {
  customerName: string;
  documentLabel: string;
  receiptNumber: number;
  amountLabel: string;
  dueDateLabel: string;
  overdueDays: number;
};

export function buildCollectionOrderMessage(input: CollectionOrderInput): string {
  const name = input.customerName.trim() || "cliente";
  const receipt = `${input.documentLabel} #${String(input.receiptNumber).padStart(4, "0")}`;
  const dueLine =
    input.overdueDays > 0
      ? `El mismo se encuentra vencido hace ${input.overdueDays} ${input.overdueDays === 1 ? "dia" : "dias"} (vencimiento ${input.dueDateLabel}).`
      : `El vencimiento es el ${input.dueDateLabel}.`;

  return [
    `Estimado/a ${name}:`,
    `Le escribimos de STARLIM por el comprobante ${receipt}, con un saldo pendiente de ${input.amountLabel}.`,
    dueLine,
    "Le solicitamos emitir el pago a la brevedad. Adjuntamos el comprobante correspondiente.",
    "Ante cualquier consulta quedamos a disposicion. Muchas gracias.",
  ].join("\n");
}
