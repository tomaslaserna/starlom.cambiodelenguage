export const SUPERVISOR_MAX_STEPS = 5;

/** Leave the final step for an answer after dependent reads (search -> history). */
export function prepareSupervisorStep({ stepNumber }: { stepNumber: number }) {
  return stepNumber >= SUPERVISOR_MAX_STEPS - 1
    ? { toolChoice: "none" as const }
    : {};
}
