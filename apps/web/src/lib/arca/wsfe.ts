import { ApiError } from "@/lib/api-response";
import { getArcaConfig } from "@/lib/arca/config";
import { getWsaaTicket } from "@/lib/arca/wsaa";
import { escapeXml, postSoapXml, soapEnvelope, tagContent, tagContents } from "@/lib/arca/xml";

type ArcaMessage = {
  code: string;
  message: string;
  source: "error" | "observation" | "event";
};

type ArcaPointOfSale = {
  number: number;
  emissionType: string;
  blocked: string;
  disabledAt: string;
};

type ArcaVatCondition = {
  id: number;
  description: string;
  receiptClass: string;
};

export type ArcaInvoiceAuthorization = {
  pointOfSale: number;
  receiptType: number;
  receiptNumber: number;
  issueDate: string;
  cae: string;
  caeExpiresAt: string;
  observations: ArcaMessage[];
};

export type ArcaAuthorizedReceipt = ArcaInvoiceAuthorization & {
  customerDocument: string;
  totalAmount: number;
  associatedReceipts: Array<{
    pointOfSale: number;
    receiptType: number;
    receiptNumber: number;
  }>;
};

type AuthorizeArcaInvoiceInput = {
  customerDocument: string;
  customerVatCondition: string;
  receiptType: number;
  totalAmount: number;
  preserveReceiptType?: boolean;
  associatedReceipt?: {
    pointOfSale: number;
    receiptType: number;
    receiptNumber: number;
  };
};

const IVA_RECEIPT_TYPES = new Set([1, 2, 3, 6, 7, 8]);
const RECEIPT_TYPE_CLASS: Record<number, "A" | "B" | "C"> = {
  1: "A",
  2: "A",
  3: "A",
  6: "B",
  7: "B",
  8: "B",
  11: "C",
  12: "C",
  13: "C",
};
const RECEIPT_TYPE_BY_KIND_AND_CLASS: Record<"invoice" | "debit_note" | "credit_note", Record<"A" | "B" | "C", number>> = {
  invoice: { A: 1, B: 6, C: 11 },
  debit_note: { A: 2, B: 7, C: 12 },
  credit_note: { A: 3, B: 8, C: 13 },
};
const VAT_CONDITION_CLASSES: Record<number, Array<"A" | "B" | "C">> = {
  1: ["A", "C"],
  4: ["B", "C"],
  5: ["B", "C"],
  6: ["A", "C"],
  7: ["B", "C"],
  8: ["B", "C"],
  9: ["B", "C"],
  10: ["B", "C"],
  13: ["A", "C"],
  15: ["B", "C"],
  16: ["A", "C"],
};
const WSFE_NAMESPACE = "http://ar.gov.afip.dif.FEV1/";

function money(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function amount(value: number) {
  return money(value).toFixed(2);
}

function argentinaDateYYYYMMDD(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}${byType.month}${byType.day}`;
}

function arcaDateToIso(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function documentForArca(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return { docTipo: 80, docNro: Number(digits) };
  if (digits.length >= 7 && digits.length <= 8) return { docTipo: 96, docNro: Number(digits) };
  throw new ApiError(400, "El cliente necesita CUIT de 11 digitos o DNI de 7/8 digitos para emitir factura fiscal.");
}

function invoiceAmounts(receiptType: number, totalAmount: number) {
  const total = money(totalAmount);
  if (!Number.isFinite(total) || total <= 0) throw new ApiError(400, "El total fiscal debe ser mayor a cero.");

  if (IVA_RECEIPT_TYPES.has(receiptType)) {
    const net = money(total / 1.21);
    const vat = money(total - net);
    return { net, vat, total };
  }

  return { net: total, vat: 0, total };
}

function normalizeVatCondition(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function receiptKind(receiptType: number): "invoice" | "debit_note" | "credit_note" {
  if ([2, 7, 12].includes(receiptType)) return "debit_note";
  if ([3, 8, 13].includes(receiptType)) return "credit_note";
  return "invoice";
}

function associatedReceiptXml(receiptType: number, associatedReceipt: AuthorizeArcaInvoiceInput["associatedReceipt"]) {
  const kind = receiptKind(receiptType);
  if (kind === "invoice") return "";
  if (
    !associatedReceipt ||
    !Number.isInteger(associatedReceipt.pointOfSale) ||
    associatedReceipt.pointOfSale <= 0 ||
    !Number.isInteger(associatedReceipt.receiptType) ||
    associatedReceipt.receiptType <= 0 ||
    !Number.isInteger(associatedReceipt.receiptNumber) ||
    associatedReceipt.receiptNumber <= 0
  ) {
    throw new ApiError(400, "La nota fiscal necesita el comprobante original asociado.");
  }

  return `<CbtesAsoc>
          <CbteAsoc>
            <Tipo>${associatedReceipt.receiptType}</Tipo>
            <PtoVta>${associatedReceipt.pointOfSale}</PtoVta>
            <Nro>${associatedReceipt.receiptNumber}</Nro>
          </CbteAsoc>
        </CbtesAsoc>`;
}

function defaultVatConditionId(receiptType: number) {
  const receiptClass = RECEIPT_TYPE_CLASS[receiptType];
  if (receiptClass === "A") return 1;
  if (receiptClass === "B") return 5;
  if (receiptClass === "C") return 6;
  return 5;
}

export function vatConditionIdForArca(value: string, receiptType: number) {
  const normalized = normalizeVatCondition(value);
  if (!normalized) return defaultVatConditionId(receiptType);

  if (normalized.includes("responsableinscripto") || normalized === "ri" || normalized.includes("ivaresponsable")) {
    return 1;
  }
  if (normalized.includes("monotributistasocial")) return 13;
  if (normalized.includes("trabajadorindependientepromovido") || normalized.includes("promovido")) return 16;
  if (normalized.includes("monotributo") || normalized.includes("monotributista")) return 6;
  if (normalized.includes("consumidorfinal")) return 5;
  if (normalized.includes("exento")) return 4;
  if (normalized.includes("nocategorizado")) return 7;
  if (normalized.includes("proveedordelexterior")) return 8;
  if (normalized.includes("clientedelexterior")) return 9;
  if (normalized.includes("liberado")) return 10;
  if (normalized.includes("noalcanzado")) return 15;

  return defaultVatConditionId(receiptType);
}

function preferredReceiptClassForVatCondition(conditionId: number) {
  const allowed = VAT_CONDITION_CLASSES[conditionId] ?? ["B"];
  if (allowed.includes("A")) return "A";
  if (allowed.includes("B")) return "B";
  return allowed[0] ?? "B";
}

export function receiptTypeForArcaVatCondition(value: string, receiptType: number) {
  const conditionId = vatConditionIdForArca(value, receiptType);
  const receiptClass = RECEIPT_TYPE_CLASS[receiptType];
  if (receiptClass && (VAT_CONDITION_CLASSES[conditionId] ?? []).includes(receiptClass)) {
    return receiptType;
  }

  const nextClass = preferredReceiptClassForVatCondition(conditionId);
  return RECEIPT_TYPE_BY_KIND_AND_CLASS[receiptKind(receiptType)][nextClass];
}

function arcaMessages(xml: string, tag: "Err" | "Obs" | "Evt", source: ArcaMessage["source"]) {
  return tagContents(xml, tag)
    .map((block) => ({
      code: tagContent(block, "Code") || tagContent(block, "Id"),
      message: tagContent(block, "Msg"),
      source,
    }))
    .filter((item) => item.code || item.message);
}

function messageText(messages: ArcaMessage[]) {
  return messages
    .map((item) => [item.source, item.code, item.message].filter(Boolean).join(" "))
    .join(" | ");
}

function isPointOfSaleNotEnabled(messages: ArcaMessage[]) {
  return messages.some(
    (item) =>
      item.source === "error" &&
      (item.code === "1002" ||
        item.code === "11002" ||
        item.message.toLowerCase().includes("punto de venta no se encuentra habilitado")),
  );
}

function isNoPointOfSaleResult(message: string) {
  return /\b602\b/.test(message) && /sin resultados|FEParamGetPtosVenta/i.test(message);
}

async function wsfeSoap(method: string, innerXml: string) {
  const config = getArcaConfig();
  const response = await postSoapXml(
    config.wsfeEndpoint,
    `${WSFE_NAMESPACE}${method}`,
    soapEnvelope(`<${method} xmlns="${WSFE_NAMESPACE}">${innerXml}</${method}>`),
  );
  return response;
}

async function authXml() {
  const config = getArcaConfig();
  const ticket = await getWsaaTicket(config);
  return `<Auth>
    <Token>${escapeXml(ticket.token)}</Token>
    <Sign>${escapeXml(ticket.sign)}</Sign>
    <Cuit>${config.cuit}</Cuit>
  </Auth>`;
}

export async function listArcaPointsOfSale() {
  const response = await wsfeSoap("FEParamGetPtosVenta", `${await authXml()}`);
  const result = tagContent(response, "FEParamGetPtosVentaResult");
  const messages = [
    ...arcaMessages(result, "Err", "error"),
    ...arcaMessages(result, "Evt", "event"),
  ];
  const points = tagContents(result, "PtoVenta").map<ArcaPointOfSale>((block) => ({
    number: Number(tagContent(block, "Nro") || 0),
    emissionType: tagContent(block, "EmisionTipo"),
    blocked: tagContent(block, "Bloqueado"),
    disabledAt: tagContent(block, "FchBaja"),
  }));

  return { points, messages };
}

export async function listArcaVatConditions(receiptClass?: "A" | "B" | "C") {
  const response = await wsfeSoap(
    "FEParamGetCondicionIvaReceptor",
    `${await authXml()}${receiptClass ? `<ClaseCmp>${receiptClass}</ClaseCmp>` : ""}`,
  );
  const result = tagContent(response, "FEParamGetCondicionIvaReceptorResult");
  const messages = [
    ...arcaMessages(result, "Err", "error"),
    ...arcaMessages(result, "Evt", "event"),
  ];
  const conditions = tagContents(result, "CondicionIvaReceptor").map<ArcaVatCondition>((block) => ({
    id: Number(tagContent(block, "Id") || 0),
    description: tagContent(block, "Desc"),
    receiptClass: tagContent(block, "Cmp_Clase"),
  }));

  return { conditions, messages };
}

async function pointOfSaleDiagnostic(configuredPointOfSale: number) {
  try {
    const { points, messages } = await listArcaPointsOfSale();
    if (points.length === 0) {
      const arcaMessage = messageText(messages);
      return [
        `FEParamGetPtosVenta no devolvio puntos de venta habilitados para WSFE.`,
        arcaMessage ? `ARCA informo: ${arcaMessage}.` : "",
        "Habilita un punto de venta Web Service/RECE en ARCA o cambia STARLIM_ARCA_POINT_OF_SALE al punto correcto.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const enabledPoints = points
      .map((point) => `${point.number}${point.emissionType ? ` (${point.emissionType})` : ""}`)
      .join(", ");
    return `El punto configurado ${configuredPointOfSale} no esta habilitado para WSFE. Puntos devueltos por ARCA: ${enabledPoints}.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    if (isNoPointOfSaleResult(message)) {
      return [
        "FEParamGetPtosVenta devolvio 602 Sin Resultados: ARCA no informa ningun punto de venta habilitado para WSFE para este CUIT.",
        `El punto configurado es ${configuredPointOfSale}.`,
        "Habilita en ARCA un punto de venta Web Service/RECE fiscal o cambia STARLIM_ARCA_POINT_OF_SALE al punto correcto.",
      ].join(" ");
    }

    return `No se pudo consultar FEParamGetPtosVenta para diagnosticar puntos de venta: ${message}.`;
  }
}

async function lastAuthorizedReceipt(receiptType: number) {
  const config = getArcaConfig();
  const response = await wsfeSoap(
    "FECompUltimoAutorizado",
    `${await authXml()}
    <PtoVta>${config.pointOfSale}</PtoVta>
    <CbteTipo>${receiptType}</CbteTipo>`,
  );
  const result = tagContent(response, "FECompUltimoAutorizadoResult");
  const messages = [
    ...arcaMessages(result, "Err", "error"),
    ...arcaMessages(result, "Evt", "event"),
  ];
  if (messages.some((item) => item.source === "error")) {
    if (isPointOfSaleNotEnabled(messages)) {
      throw new ApiError(
        502,
        `Punto de venta ARCA no habilitado para WSFE. ${messageText(messages)}. ${await pointOfSaleDiagnostic(
          config.pointOfSale,
        )}`,
      );
    }
    throw new ApiError(502, `ARCA rechazo la consulta de ultimo comprobante: ${messageText(messages)}`);
  }

  return Number(tagContent(result, "CbteNro") || 0);
}

export async function consultArcaAuthorizedReceipt(
  receiptType: number,
  receiptNumber: number,
): Promise<ArcaAuthorizedReceipt | null> {
  if (!Number.isInteger(receiptType) || receiptType <= 0) {
    throw new ApiError(400, "Tipo de comprobante ARCA invalido.");
  }
  if (!Number.isInteger(receiptNumber) || receiptNumber <= 0) {
    return null;
  }

  const config = getArcaConfig();
  const response = await wsfeSoap(
    "FECompConsultar",
    `${await authXml()}
    <FeCompConsReq>
      <CbteTipo>${receiptType}</CbteTipo>
      <CbteNro>${receiptNumber}</CbteNro>
      <PtoVta>${config.pointOfSale}</PtoVta>
    </FeCompConsReq>`,
  );
  const result = tagContent(response, "FECompConsultarResult");
  const detail = tagContent(result, "ResultGet") || result;
  const messages = [
    ...arcaMessages(result, "Err", "error"),
    ...arcaMessages(detail, "Obs", "observation"),
    ...arcaMessages(result, "Evt", "event"),
  ];

  if (messages.some((item) => item.source === "error")) {
    throw new ApiError(502, `ARCA rechazo la consulta del comprobante: ${messageText(messages)}`);
  }

  const cae = tagContent(detail, "CodAutorizacion") || tagContent(detail, "CAE");
  if (!cae) return null;

  const caeExpiresAt = arcaDateToIso(tagContent(detail, "FchVto") || tagContent(detail, "CAEFchVto"));
  return {
    pointOfSale: config.pointOfSale,
    receiptType,
    receiptNumber: Number(tagContent(detail, "CbteDesde") || receiptNumber),
    issueDate: arcaDateToIso(tagContent(detail, "CbteFch")),
    cae,
    caeExpiresAt,
    observations: messages,
    customerDocument: tagContent(detail, "DocNro"),
    totalAmount: Number(tagContent(detail, "ImpTotal") || 0),
    associatedReceipts: tagContents(detail, "CbteAsoc").map((block) => ({
      receiptType: Number(tagContent(block, "Tipo") || 0),
      pointOfSale: Number(tagContent(block, "PtoVta") || 0),
      receiptNumber: Number(tagContent(block, "Nro") || 0),
    })),
  };
}

export async function findLastArcaAuthorizedReceipt(receiptType: number) {
  const receiptNumber = await lastAuthorizedReceipt(receiptType);
  return consultArcaAuthorizedReceipt(receiptType, receiptNumber);
}

export async function authorizeArcaInvoice(input: AuthorizeArcaInvoiceInput): Promise<ArcaInvoiceAuthorization> {
  const config = getArcaConfig();
  const receiptType = input.preserveReceiptType
    ? input.receiptType
    : receiptTypeForArcaVatCondition(input.customerVatCondition, input.receiptType);
  const { docTipo, docNro } = documentForArca(input.customerDocument);
  const { net, vat, total } = invoiceAmounts(receiptType, input.totalAmount);
  const vatConditionId = vatConditionIdForArca(input.customerVatCondition, receiptType);
  const receiptNumber = (await lastAuthorizedReceipt(receiptType)) + 1;
  const invoiceDate = argentinaDateYYYYMMDD();
  const cbtesAsocXml = associatedReceiptXml(receiptType, input.associatedReceipt);
  const ivaXml =
    vat > 0
      ? `<Iva>
          <AlicIva>
            <Id>5</Id>
            <BaseImp>${amount(net)}</BaseImp>
            <Importe>${amount(vat)}</Importe>
          </AlicIva>
        </Iva>`
      : "";

  const response = await wsfeSoap(
    "FECAESolicitar",
    `${await authXml()}
    <FeCAEReq>
      <FeCabReq>
        <CantReg>1</CantReg>
        <PtoVta>${config.pointOfSale}</PtoVta>
        <CbteTipo>${receiptType}</CbteTipo>
      </FeCabReq>
      <FeDetReq>
        <FECAEDetRequest>
          <Concepto>1</Concepto>
          <DocTipo>${docTipo}</DocTipo>
          <DocNro>${docNro}</DocNro>
          <CondicionIVAReceptorId>${vatConditionId}</CondicionIVAReceptorId>
          <CbteDesde>${receiptNumber}</CbteDesde>
          <CbteHasta>${receiptNumber}</CbteHasta>
          <CbteFch>${invoiceDate}</CbteFch>
          <ImpTotal>${amount(total)}</ImpTotal>
          <ImpTotConc>0.00</ImpTotConc>
          <ImpNeto>${amount(net)}</ImpNeto>
          <ImpOpEx>0.00</ImpOpEx>
          <ImpTrib>0.00</ImpTrib>
          <ImpIVA>${amount(vat)}</ImpIVA>
          <MonId>PES</MonId>
          <MonCotiz>1.00</MonCotiz>
          ${cbtesAsocXml}
          ${ivaXml}
        </FECAEDetRequest>
      </FeDetReq>
    </FeCAEReq>`,
  );

  const result = tagContent(response, "FECAESolicitarResult");
  const detail = tagContent(result, "FECAEDetResponse") || result;
  const messages = [
    ...arcaMessages(result, "Err", "error"),
    ...arcaMessages(detail, "Obs", "observation"),
    ...arcaMessages(result, "Evt", "event"),
  ];
  const cae = tagContent(detail, "CAE");
  const caeExpiresAt = arcaDateToIso(tagContent(detail, "CAEFchVto"));
  const resultCode = tagContent(detail, "Resultado") || tagContent(result, "Resultado");

  if (resultCode !== "A" || !cae || !caeExpiresAt) {
    throw new ApiError(400, `ARCA no aprobo el comprobante: ${messageText(messages) || "sin CAE devuelto"}`);
  }

  return {
    pointOfSale: config.pointOfSale,
    receiptType,
    receiptNumber: Number(tagContent(detail, "CbteDesde") || receiptNumber),
    issueDate: arcaDateToIso(invoiceDate),
    cae,
    caeExpiresAt,
    observations: messages,
  };
}
