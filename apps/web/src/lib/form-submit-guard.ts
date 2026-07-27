// Decides whether an Enter keypress should be blocked to avoid an HTML form's
// implicit submission. Pure (no DOM/React) so it can be unit-tested. A form with
// many inputs and a single submit button will otherwise submit whenever the user
// presses Enter in any field.
export function shouldPreventImplicitSubmit(key: string, tagName: string, inputType?: string): boolean {
  if (key !== "Enter") return false;
  const tag = tagName.toUpperCase();
  if (tag === "TEXTAREA") return false; // Enter should insert a newline
  if (tag === "BUTTON") return false; // explicit button activation
  if (tag === "INPUT" && (inputType ?? "").toLowerCase() === "submit") return false;
  return true;
}
