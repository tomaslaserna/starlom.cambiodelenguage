import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";

export type FiscalProviderName = "disabled" | "arca";
export type FiscalEnvironmentMode = "disabled" | "testing" | "production";
export type FiscalDocumentSource = "sale" | "remittance" | "sales_document";
export type FiscalDocumentKind = "invoice" | "credit_note" | "debit_note";

export type FiscalStatus = {
  provider: FiscalProviderName;
  enabled: boolean;
  ready: boolean;
  mode: FiscalEnvironmentMode;
  message: string;
  missingEnv: string[];
};

export type FiscalAuthorizationInput = {
  companyId: number;
  userId: number;
  username: string;
  documentId: number;
  source: FiscalDocumentSource;
  kind: FiscalDocumentKind;
};

export type FiscalAuthorizationResult = {
  documentId: number;
  receiptType: number;
  receiptNumber: number;
  cae: string;
  caeExpiresAt: string;
};

type FiscalProvider = {
  name: FiscalProviderName;
  status(): FiscalStatus;
  authorizeDocument(input: FiscalAuthorizationInput): Promise<FiscalAuthorizationResult>;
};

const ARCA_REQUIRED_ENV = [
  "STARLIM_ARCA_CUIT",
  "STARLIM_ARCA_CERT_PATH",
  "STARLIM_ARCA_KEY_PATH",
  "STARLIM_ARCA_POINT_OF_SALE",
] as const;

function selectedProviderName(): FiscalProviderName {
  const value = (process.env.STARLIM_FISCAL_PROVIDER ?? "disabled").trim().toLowerCase();
  return value === "arca" ? "arca" : "disabled";
}

function selectedMode(): FiscalEnvironmentMode {
  const value = (process.env.STARLIM_FISCAL_MODE ?? "disabled").trim().toLowerCase();
  if (value === "testing" || value === "production") return value;
  return "disabled";
}

export function fiscalUnavailable(message = "La facturacion fiscal ARCA esta deshabilitada.") {
  return new ApiError(410, message);
}

class DisabledFiscalProvider implements FiscalProvider {
  name: FiscalProviderName = "disabled";

  status(): FiscalStatus {
    return {
      provider: this.name,
      enabled: false,
      ready: false,
      mode: "disabled",
      message:
        "Facturacion fiscal deshabilitada. Las ventas y notas internas pueden operar sin emitir CAE.",
      missingEnv: [],
    };
  }

  async authorizeDocument(): Promise<FiscalAuthorizationResult> {
    throw fiscalUnavailable();
  }
}

class PendingArcaFiscalProvider implements FiscalProvider {
  name: FiscalProviderName = "arca";

  status(): FiscalStatus {
    const missingEnv = ARCA_REQUIRED_ENV.filter((key) => !process.env[key]);

    return {
      provider: this.name,
      enabled: false,
      ready: false,
      mode: selectedMode(),
      message:
        "ARCA esta reservado para la ultima etapa: falta conectar el adaptador WSFEv1 y validar el circuito fiscal.",
      missingEnv,
    };
  }

  async authorizeDocument(): Promise<FiscalAuthorizationResult> {
    throw fiscalUnavailable(
      "ARCA esta reservado para la ultima etapa. El punto de integracion ya existe, pero no emite CAE todavia.",
    );
  }
}

export function getFiscalProvider(): FiscalProvider {
  return selectedProviderName() === "arca"
    ? new PendingArcaFiscalProvider()
    : new DisabledFiscalProvider();
}

export function getFiscalStatus() {
  return getFiscalProvider().status();
}

export async function authorizeFiscalDocument(
  session: AuthSession,
  documentId: number,
  source: FiscalDocumentSource,
  kind: FiscalDocumentKind,
) {
  return getFiscalProvider().authorizeDocument({
    companyId: session.companyId,
    userId: session.userId,
    username: session.username,
    documentId,
    source,
    kind,
  });
}
