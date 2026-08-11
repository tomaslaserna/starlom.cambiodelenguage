export const COLLECTION_METHODS = ["efectivo", "transferencia", "echeck"] as const;

export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

/**
 * Regla única de negocio: los métodos distintos de efectivo (transferencia,
 * e-check) exigen un número/referencia de operación para poder conciliar.
 * Se usa tanto en la validación del servidor como en el formulario de cobro,
 * para que UI y backend no puedan desincronizarse.
 */
export function collectionMethodRequiresOperation(method: string): boolean {
  return method.trim().toLowerCase() !== "efectivo";
}

/** Destinos por defecto que sugiere el formulario según el método. */
export const CASH_DESTINATION = "Caja";
export const BANK_DESTINATION = "Cuenta bancaria";

/** Conjunto de destinos "sugeridos" (no editados a mano por el usuario). */
export const SUGGESTED_DESTINATIONS = [CASH_DESTINATION, BANK_DESTINATION];

/**
 * Destino sugerido según el método: efectivo va a Caja; transferencia y e-check
 * van a una cuenta bancaria. El campo sigue siendo editable.
 */
export function suggestedCollectionDestination(method: string): string {
  return collectionMethodRequiresOperation(method) ? BANK_DESTINATION : CASH_DESTINATION;
}
