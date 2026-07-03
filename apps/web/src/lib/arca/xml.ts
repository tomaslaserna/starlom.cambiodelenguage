import { constants } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { ApiError } from "@/lib/api-response";

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: "\"",
};

export function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

export function decodeXmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    return XML_ENTITIES[normalized] ?? `&${entity};`;
  });
}

export function tagContents(xml: string, tagName: string) {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${tagName}>`,
    "gi",
  );
  return [...xml.matchAll(pattern)].map((match) => decodeXmlEntities(match[1]?.trim() ?? ""));
}

export function tagContent(xml: string, tagName: string) {
  return tagContents(xml, tagName)[0] ?? "";
}

export function soapEnvelope(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function soapFaultMessage(xml: string) {
  const fault = tagContent(xml, "Fault");
  if (!fault) return "";

  const faultString = tagContent(fault, "faultstring") || tagContent(fault, "FaultString");
  if (faultString) return faultString;

  const code = tagContent(fault, "Code");
  const message = tagContent(fault, "Msg");
  if (code || message) return [code, message].filter(Boolean).join(" - ");
  return "";
}

type SoapResponse = {
  ok: boolean;
  status: number;
  text: string;
};

function isLegacyTlsFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = error.cause;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
  const causeMessage =
    cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
  return (
    causeCode === "ERR_SSL_DH_KEY_TOO_SMALL" ||
    error.message.includes("ERR_SSL_DH_KEY_TOO_SMALL") ||
    causeMessage.includes("dh key too small")
  );
}

function legacyTlsPostSoapXml(endpoint: string, soapAction: string, body: string): Promise<SoapResponse> {
  const url = new URL(endpoint);
  const bodyBuffer = Buffer.from(body, "utf8");

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        ciphers: "DEFAULT:@SECLEVEL=0",
        headers: {
          "Content-Length": bodyBuffer.length,
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: soapAction,
        },
        hostname: url.hostname,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        port: url.port ? Number(url.port) : 443,
        secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(30000, () => {
      request.destroy(new Error("Tiempo de espera agotado al conectar con ARCA."));
    });
    request.on("error", reject);
    request.end(bodyBuffer);
  });
}

async function fetchPostSoapXml(endpoint: string, soapAction: string, body: string): Promise<SoapResponse> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: soapAction,
      },
      body,
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    if (endpoint.startsWith("https://") && isLegacyTlsFailure(error)) {
      return legacyTlsPostSoapXml(endpoint, soapAction, body);
    }
    const detail = error instanceof Error ? error.message : "Error de red desconocido";
    throw new ApiError(502, `No se pudo conectar con ARCA (${new URL(endpoint).hostname}): ${detail}`);
  }
}

export async function postSoapXml(endpoint: string, soapAction: string, body: string) {
  const response = await fetchPostSoapXml(endpoint, soapAction, body);
  const { text } = response;
  const fault = soapFaultMessage(text);

  if (!response.ok) {
    throw new ApiError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      fault || `ARCA no respondio correctamente (${response.status}).`,
    );
  }
  if (fault) throw new ApiError(502, fault);
  return text;
}
