import { registerHooks } from "node:module";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { pool } from "./local-db.mjs";
const dir = process.env.ARCA_HOMO_CERT_DIR;
const cert = join(dir,"starlim-homologacion.crt");
if (!new X509Certificate(readFileSync(cert)).issuer.includes("Computadores Test")) throw Error("Se requiere certificado de homologacion");
for (const variable of Object.keys(process.env)) {
  if (variable.startsWith("STARLIM_ARCA_")) delete process.env[variable];
}
Object.assign(process.env,{STARLIM_FISCAL_MODE:"testing",STARLIM_ARCA_CUIT:process.env.ARCA_HOMO_CUIT,STARLIM_ARCA_POINT_OF_SALE:process.env.ARCA_HOMO_POS || "1",STARLIM_ARCA_CERT_PATH:cert,STARLIM_ARCA_KEY_PATH:join(dir,"starlim-homologacion.key")});
globalThis.arcaHomoPool=pool;
registerHooks({resolve(spec,ctx,next){
  if (spec==="@/lib/db") return {shortCircuit:true,url:"data:text/javascript,export const getDbPool=()=>globalThis.arcaHomoPool"};
  if(spec==="next/server")return next("next/server.js",ctx);
  if(spec.startsWith("@/"))return {shortCircuit:true,url:new URL("../../src/"+spec.slice(2)+".ts",import.meta.url).href};
  return next(spec,ctx);
}});
const {getArcaConfig}=await import("../../src/lib/arca/config.ts");
const {getWsaaTicket}=await import("../../src/lib/arca/wsaa.ts");
const {postSoapXml,escapeXml,tagContent}=await import("../../src/lib/arca/xml.ts");
const cfg=getArcaConfig();
if(cfg.wsaaEndpoint!=="https://wsaahomo.afip.gov.ar/ws/services/LoginCms"||cfg.wsfeEndpoint!=="https://wswhomo.afip.gov.ar/wsfev1/service.asmx")throw Error("Entorno incorrecto");
export async function sendTestingSoap(method, body) {
  if(!["FECompUltimoAutorizado","FECompConsultar","FECAESolicitar"].includes(method))throw Error("Operacion inesperada");
  const ticket=await getWsaaTicket(cfg);
  const auth="<Auth><Token>"+escapeXml(ticket.token)+"</Token><Sign>"+escapeXml(ticket.sign)+"</Sign><Cuit>"+cfg.cuit+"</Cuit></Auth>";
  if(!body.includes("<Auth>") || Number(tagContent(body,"PtoVta"))!==cfg.pointOfSale)throw Error("Solicitud fuera del ensayo");
  return postSoapXml(cfg.wsfeEndpoint,"http://ar.gov.afip.dif.FEV1/"+method,body.replace(/<Auth>[\s\S]*?<\/Auth>/,()=>auth));
}
if(process.argv.includes("--check")) {
  try {
    const {listArcaPointsOfSale}=await import("../../src/lib/arca/wsfe.ts");
    const ta=await getWsaaTicket(cfg);
    console.log("Ticket de homologación válido hasta",new Date(ta.expiresAt).toISOString());
    console.log(JSON.stringify(await listArcaPointsOfSale()));
  } finally {await pool.end();}
}

