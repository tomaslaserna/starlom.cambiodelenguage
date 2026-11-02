export function supervisorToolStateLabel(state: string, busy: boolean) {
  if (state === "output-available") return "listo";
  if (state === "output-error") return "sin resultado";
  if (state === "output-denied") return "sin permiso";
  return busy ? "en curso" : "sin completar";
}
