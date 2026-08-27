import "server-only";

export function supervisorAiEnabled() {
  return process.env.SUPERVISOR_AI_ENABLED === "true";
}

export function supervisorAiHasCredentials() {
  // AI Gateway accepts an explicit key for local/foreign runtimes and Vercel
  // OIDC automatically inside Vercel deployments.
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL === "1");
}

export function assertSupervisorAiConfigured() {
  if (!supervisorAiEnabled()) throw new Error("SUPERVISOR_AI_DISABLED");
  if (!supervisorAiHasCredentials()) throw new Error("SUPERVISOR_AI_NOT_CONFIGURED");
}
