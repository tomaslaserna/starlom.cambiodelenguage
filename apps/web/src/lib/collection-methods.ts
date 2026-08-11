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
