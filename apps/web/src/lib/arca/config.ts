import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";
import type { FiscalEnvironmentMode } from "@/lib/fiscal";

export const ARCA_REQUIRED_ENV = [
  "STARLIM_ARCA_CUIT",
  "STARLIM_ARCA_CERT_PATH",
  "STARLIM_ARCA_KEY_PATH",
  "STARLIM_ARCA_POINT_OF_SALE",
] as const;

export type ArcaConfig = {
  cuit: number;
  certPath: string;
  keyPath: string;
  mode: Exclude<FiscalEnvironmentMode, "disabled">;
  pointOfSale: number;
  wsaaEndpoint: string;
  wsfeEndpoint: string;
};

const ENDPOINTS = {
  testing: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
  production: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
} as const;

export function arcaMissingEnv() {
  return ARCA_REQUIRED_ENV.filter((key) => !envValue(key));
}

export function arcaMode(): FiscalEnvironmentMode {
  const mode = (envValue("STARLIM_FISCAL_MODE") ?? "disabled").toLowerCase();
  if (mode === "testing" || mode === "production") return mode;
  return "disabled";
}

function numericEnv(key: string, label: string) {
  const raw = envValue(key) ?? "";
  const normalized = raw.replace(/\D/g, "");
  const value = Number(normalized);
  if (!normalized || !Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError(503, `${label} ARCA invalido o no configurado.`);
  }
  return value;
}

function requiredPathEnv(key: string, label: string) {
  const path = envValue(key) ?? "";
  if (!path) {
    throw new ApiError(503, `${label} ARCA no esta configurado.`);
  }
  return path;
}

export function getArcaConfig(): ArcaConfig {
  const mode = arcaMode();
  if (mode === "disabled") throw new ApiError(503, "ARCA esta deshabilitado por configuracion.");

  const endpoints = ENDPOINTS[mode];
  return {
    cuit: numericEnv("STARLIM_ARCA_CUIT", "CUIT"),
    certPath: requiredPathEnv("STARLIM_ARCA_CERT_PATH", "Certificado"),
    keyPath: requiredPathEnv("STARLIM_ARCA_KEY_PATH", "Clave privada"),
    mode,
    pointOfSale: numericEnv("STARLIM_ARCA_POINT_OF_SALE", "Punto de venta"),
    wsaaEndpoint: endpoints.wsaa,
    wsfeEndpoint: endpoints.wsfe,
  };
}
