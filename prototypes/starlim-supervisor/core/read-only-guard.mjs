const MUTATION = /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|comment|copy|call|do)\b/i;

export function assertReadOnlySql(sql) {
  const normalized = String(sql ?? "").replace(/--.*$/gm, " ").trim();
  if (!/^(select|with)\b/i.test(normalized) || MUTATION.test(normalized)) {
    const error = new Error("El Supervisor solo admite consultas SQL de lectura.");
    error.code = "SUPERVISOR_READ_ONLY";
    throw error;
  }
  return normalized;
}
