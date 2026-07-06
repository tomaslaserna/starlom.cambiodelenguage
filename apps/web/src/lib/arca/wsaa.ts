import { readFile } from "node:fs/promises";
import forge from "node-forge";
import { ApiError } from "@/lib/api-response";
import type { ArcaConfig, ArcaCredential } from "@/lib/arca/config";
import { escapeXml, postSoapXml, soapEnvelope, tagContent } from "@/lib/arca/xml";

type WsaaTicket = {
  token: string;
  sign: string;
  expiresAt: number;
};

let cachedTicket: (WsaaTicket & { cacheKey: string }) | null = null;

function dateForWsaa(date: Date) {
  const argentinaWallTime = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return argentinaWallTime.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

function loginTicketRequestXml(service = "wsfe") {
  const now = new Date();
  const generation = new Date(now.getTime() - 10 * 60 * 1000);
  const expiration = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${dateForWsaa(generation)}</generationTime>
    <expirationTime>${dateForWsaa(expiration)}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

async function credentialPem(credential: ArcaCredential) {
  if (credential.type === "pem") return credential.value;
  return readFile(credential.value, "utf8");
}

async function signLoginTicketRequest(xml: string, cert: ArcaCredential, key: ArcaCredential) {
  const [certPem, keyPem] = await Promise.all([credentialPem(cert), credentialPem(key)]);

  try {
    const certificate = forge.pki.certificateFromPem(certPem);
    const privateKey = forge.pki.privateKeyFromPem(keyPem);
    const signedData = forge.pkcs7.createSignedData();
    signedData.content = forge.util.createBuffer(xml, "utf8");
    signedData.addCertificate(certificate);
    signedData.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
      ],
    });
    signedData.sign();
    return forge.util.encode64(forge.asn1.toDer(signedData.toAsn1()).getBytes());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    throw new ApiError(503, `No se pudo firmar el ticket WSAA con el certificado ARCA: ${message}`);
  }
}

function parseWsaaTicket(xml: string): WsaaTicket {
  const token = tagContent(xml, "token");
  const sign = tagContent(xml, "sign");
  const expirationTime = tagContent(xml, "expirationTime");
  const expiresAt = expirationTime ? Date.parse(expirationTime) : Number.NaN;

  if (!token || !sign || !Number.isFinite(expiresAt)) {
    throw new ApiError(502, "WSAA no devolvio token/sign valido.");
  }

  return { token, sign, expiresAt };
}

export async function getWsaaTicket(config: ArcaConfig): Promise<WsaaTicket> {
  const cacheKey = `${config.mode}:${config.cuit}:${config.cert.source}:${config.key.source}`;
  if (cachedTicket?.cacheKey === cacheKey && cachedTicket.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedTicket;
  }

  const cms = await signLoginTicketRequest(loginTicketRequestXml("wsfe"), config.cert, config.key);
  const response = await postSoapXml(
    config.wsaaEndpoint,
    "",
    soapEnvelope(
      `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">
        <in0>${escapeXml(cms)}</in0>
      </loginCms>`,
    ),
  );
  const loginReturn = tagContent(response, "loginCmsReturn");
  if (!loginReturn) throw new ApiError(502, "WSAA no devolvio loginCmsReturn.");

  cachedTicket = { ...parseWsaaTicket(loginReturn), cacheKey };
  return cachedTicket;
}
