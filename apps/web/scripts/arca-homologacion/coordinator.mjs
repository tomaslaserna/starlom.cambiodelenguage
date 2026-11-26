import * as xml from "../../src/lib/arca/xml.ts";
export * from "../../src/lib/arca/xml.ts";
export async function postSoapXml(endpoint, action, body) {
  if (endpoint !== "https://wswhomo.afip.gov.ar/wsfev1/service.asmx") throw new Error("Ambiente incorrecto");
  const local = new URL(process.env.ARCA_LAB_WSFE);
  if (local.protocol !== "http:" || local.hostname !== "127.0.0.1") throw new Error("WSFE debe ser local");
  return xml.postSoapXml(local.href, action, body);
}

