import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";
import type { FiscalEnvironmentMode } from "@/lib/fiscal";

export const ARCA_REQUIRED_ENV = [
  "STARLIM_ARCA_CUIT",
  "STARLIM_ARCA_POINT_OF_SALE",
] as const;

export type ArcaCredential = {
  source: string;
  type: "path" | "pem";
  value: string;
};

export type ArcaConfig = {
  cuit: number;
  cert: ArcaCredential;
  key: ArcaCredential;
  mode: Exclude<FiscalEnvironmentMode, "disabled">;
  pointOfSale: number;
  wsaaEndpoint: string;
  wsfeEndpoint: string;
};

const ARCA_CERT_ENV = {
  path: "STARLIM_ARCA_CERT_PATH",
  pem: "STARLIM_ARCA_CERT_PEM",
  base64: "STARLIM_ARCA_CERT_BASE64",
} as const;

const ARCA_KEY_ENV = {
  path: "STARLIM_ARCA_KEY_PATH",
  pem: "STARLIM_ARCA_KEY_PEM",
  base64: "STARLIM_ARCA_KEY_BASE64",
} as const;

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
  const missing: string[] = ARCA_REQUIRED_ENV.filter((key) => !envValue(key));
  if (!hasCredential(ARCA_CERT_ENV)) {
    missing.push("STARLIM_ARCA_CERT_PATH or STARLIM_ARCA_CERT_PEM or STARLIM_ARCA_CERT_BASE64");
  }
  if (!hasCredential(ARCA_KEY_ENV)) {
    missing.push("STARLIM_ARCA_KEY_PATH or STARLIM_ARCA_KEY_PEM or STARLIM_ARCA_KEY_BASE64");
  }
  return missing;
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

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n");
}

function decodeBase64(value: string, label: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8").trim();
  } catch {
    throw new ApiError(503, `${label} ARCA en base64 no es valido.`);
  }
}

type ArcaCredentialEnv = typeof ARCA_CERT_ENV | typeof ARCA_KEY_ENV;

function hasCredential(env: ArcaCredentialEnv) {
  return Boolean(envValue(env.path) || envValue(env.pem) || envValue(env.base64));
}

function requiredCredential(env: ArcaCredentialEnv, label: string): ArcaCredential {
  const base64 = envValue(env.base64);
  if (base64) {
    return {
      source: env.base64,
      type: "pem",
      value: decodeBase64(base64, label),
    };
  }

  const pem = envValue(env.pem);
  if (pem) {
    return {
      source: env.pem,
      type: "pem",
      value: normalizePem(pem),
    };
  }

  const path = envValue(env.path);
  if (path) {
    return {
      source: env.path,
      type: "path",
      value: path,
    };
  }

  throw new ApiError(503, `${label} ARCA no esta configurado.`);
}

export function getArcaConfig(): ArcaConfig {
  const mode = arcaMode();
  if (mode === "disabled") throw new ApiError(503, "ARCA esta deshabilitado por configuracion.");

  const endpoints = ENDPOINTS[mode];
  return {
    cuit: numericEnv("STARLIM_ARCA_CUIT", "CUIT"),
    cert: requiredCredential(ARCA_CERT_ENV, "Certificado"),
    key: requiredCredential(ARCA_KEY_ENV, "Clave privada"),
    mode,
    pointOfSale: numericEnv("STARLIM_ARCA_POINT_OF_SALE", "Punto de venta"),
    wsaaEndpoint: endpoints.wsaa,
    wsfeEndpoint: endpoints.wsfe,
  };
}
