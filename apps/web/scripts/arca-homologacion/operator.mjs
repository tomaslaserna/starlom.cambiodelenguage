import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import { pool } from "./local-db.mjs";
const coordinator = new URL("./coordinator.mjs", import.meta.url).href;
const api = (source) => ({shortCircuit:true, url:"data:text/javascript," + encodeURIComponent(source)});
globalThis.arcaLabPool = pool;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/arca/xml" && context.parentURL?.endsWith("/wsfe.ts")) return {shortCircuit:true,url:coordinator};
    if (specifier === "@/lib/arca/wsaa") return api("export async function getWsaaTicket(){ return {token:'LAB',sign:'LAB'}; }");
    if (specifier === "pg" && context.parentURL?.endsWith("/db.ts")) return api("export class Pool { constructor(){return globalThis.arcaLabPool} }");
    if (specifier === "next/server") return next("next/server.js",context);
    if (specifier.startsWith("@/")) return {shortCircuit:true,url:new URL("../../src/"+specifier.slice(2)+".ts",import.meta.url).href};
    return next(specifier,context);
  },
});
Object.assign(process.env, {
  DATABASE_URL:"postgresql://127.0.0.1/arca_homologacion_lab",
  STARLIM_FISCAL_MODE:"testing", STARLIM_FISCAL_PROVIDER:"arca", STARLIM_ARCA_CUIT:"30000000007",
  STARLIM_ARCA_POINT_OF_SALE:"2", STARLIM_ARCA_CERT_PEM:"LAB", STARLIM_ARCA_KEY_PEM:"LAB",
});
const { authorizeSaleFiscalDocument } = await import("../../src/lib/fiscal.ts");
try {
  const result = await authorizeSaleFiscalDocument({
    companyId:1,userId:randomUUID(),username:process.env.ARCA_LAB_OPERATOR,
  }, process.env.ARCA_LAB_SALE);
  process.send({status:"ok",number:result.receiptNumber,cae:result.cae,pid:process.pid});
} catch (error) {
  process.send({status:"error",message:error.message,pid:process.pid});
} finally {
  await pool.end();
}
