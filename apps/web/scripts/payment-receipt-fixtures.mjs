// Entirely synthetic, bank-like layouts for vision accuracy and latency tests.
// Never use these files to register a payment.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const examples = [
  { name: "completed", amount: 577408.19, date: "2026-10-13", operation: "LR7DHfL581", lines: [
    "COMPROBANTE DE TRANSFERENCIA", "Transferencia realizada - ARS", "Importe: $ 577.408,19",
    "Fecha de pago: 13/10/2026 19:11", "Fecha de impresion: 21/10/2026",
    "CUIT emisor: 30-12345678-9", "CBU destino: 0720123456789012345678", "Numero de operacion: LR7DHfL581",
  ] },
  { name: "small-text", amount: 94402.18, date: "2026-06-22", operation: "164541372829", lines: [
    "TRANSFERENCIA REALIZADA", "Moneda: Pesos argentinos (ARS)", "Importe transferido $ 94.402,18",
    "Lunes, 22 de junio de 2026 - 19:11 hs", "De: Persona de prueba", "Para: Empresa de prueba",
    "CVU: 0000003100011199177635", "CUIT/CUIL: 23-12345678-9", "Numero de operacion: 164541372829",
    "Codigo de identificacion: 32870543344107B626", "Impreso: 21/10/2026",
  ] },
  { name: "pending-usd", amount: null, date: null, operation: null, lines: [
    "TRANSFERENCIA PENDIENTE - NO REALIZADA", "Moneda: USD", "Importe: USD 1.234,56",
    "Fecha programada: 28/10/2026", "Identificador de solicitud: NO-ES-UN-PAGO", "No acredita pago realizado",
  ] },
];

export async function paymentReceiptFixtures() {
  return Promise.all(examples.map(async ({ name, amount, date, operation, lines }) => {
    const small = name === "small-text";
    const font = small ? 17 : 25; const spacing = small ? 46 : 55;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="800"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" fill="#172033">${lines.map((line, index) => `<text x="28" y="${55 + index * spacing}" font-size="${font}">${line}</text>`).join("")}<text x="28" y="760" font-size="14">MUESTRA SINTETICA PARA PRUEBA DE LECTURA</text></g></svg>`;
    const image = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
    return { name, image, mediaType: "image/jpeg", expected: { amount, date, operation } };
  }));
}

if (process.argv.includes("--write-fixtures")) {
  const directory = new URL("../.next/receipt-fixtures/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  for (const fixture of await paymentReceiptFixtures()) writeFileSync(new URL(`${fixture.name}.jpg`, directory), fixture.image);
  console.log("Generated 3 synthetic receipts in .next/receipt-fixtures");
}
