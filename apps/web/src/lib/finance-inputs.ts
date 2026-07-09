export type RequestBody = Record<string, unknown>;

function text(body: RequestBody, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function number(body: RequestBody, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${key} debe ser numerico`);
    return parsed;
  }
  return fallback;
}

function truthy(body: RequestBody, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "") continue;
    return ["true", "on", "1", "si", "sí", "yes"].includes(normalized);
  }
  return fallback;
}

export type SalaryPlanInput = {
  employeeId: string;
  monthly: number;
  modality: string;
  bonusEnabled: boolean;
  chargesPercent: number;
  notes: string;
};

export function salaryPlanInputFromBody(body: RequestBody): SalaryPlanInput {
  const employeeId = text(body, ["employeeId", "profileId"]);
  if (!employeeId) throw new Error("Debe seleccionar un empleado");

  const monthly = number(body, ["monthly", "sueldo_mensual"], 0);
  if (monthly <= 0) throw new Error("El sueldo debe ser mayor a cero");

  const modality = text(body, ["modality", "modalidad"], "mensual");
  const bonusEnabled = truthy(body, ["bonusEnabled", "aguinaldo_aplica"], true);

  const chargesPercent = number(body, ["chargesPercent", "cargas_pct"], 0);
  if (chargesPercent < 0 || chargesPercent > 100) {
    throw new Error("Las cargas deben estar entre 0 y 100");
  }

  const notes = text(body, ["notes", "notas"]);

  return { employeeId, monthly, modality, bonusEnabled, chargesPercent, notes };
}

export type PartnerInput = {
  name: string;
  share: number;
  notes: string;
};

export function partnerInputFromBody(body: RequestBody): PartnerInput {
  const name = text(body, ["name", "nombre"]);
  if (!name) throw new Error("El nombre del socio es obligatorio");

  const share = number(body, ["share", "participacion"], 0);
  if (share <= 0 || share > 100) throw new Error("La participacion debe ser mayor a 0 y hasta 100");

  const notes = text(body, ["notes", "notas"]);

  return { name, share, notes };
}

export type CashMovementDirection = "entrada" | "salida";

export type CashMovementInput = {
  direction: CashMovementDirection;
  concept: string;
  amount: number;
  date: string;
  notes: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function cashMovementInputFromBody(body: RequestBody): CashMovementInput {
  const direction = text(body, ["direction", "tipo"]).toLowerCase();
  if (direction !== "entrada" && direction !== "salida") {
    throw new Error("El tipo de movimiento debe ser entrada o salida");
  }

  const concept = text(body, ["concept", "concepto"]);
  if (!concept) throw new Error("El concepto es obligatorio");

  const amount = number(body, ["amount", "monto"], 0);
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero");

  const date = text(body, ["date", "fecha"]);
  if (!ISO_DATE_PATTERN.test(date)) throw new Error("La fecha es invalida");

  const notes = text(body, ["notes", "notas"]);

  return { direction, concept, amount, date, notes };
}
