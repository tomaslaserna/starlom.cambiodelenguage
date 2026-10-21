// Read-only recovery. This function must never register payments or persist images.
export const RECEIPT_READ_CLIENT_TIMEOUT_MS = 25_000;
export const RECEIPT_READ_SERVER_TIMEOUT_MS = 20_000;
const ATTEMPT_TIMEOUTS_MS = [8_000, 10_000] as const;

// Abort alone is advisory: a stalled SDK/fetch/body reader may ignore it.
// Settle our wait independently, consume late rejection, and remove listeners.
export function receiptTaskWithSignal<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    Promise.resolve().then(() => { signal.throwIfAborted(); return work(); }).then(
      (value) => { cleanup(); if (signal.aborted) reject(signal.reason); else resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

type FailureKind = "timeout" | "incomplete_output" | "rate_limit" | "upstream" | "transport" | "configuration" | "invalid_request" | "unknown";
type Failure = { kind: FailureKind; retryable: boolean; status?: number; retryAfterMs?: number };
export type ReceiptReadAttemptEvent = { attempt: number; elapsedMs: number; kind: FailureKind; status?: number; willRetry: boolean };

export function receiptReadFailure(error: unknown, timedOut = false): Failure {
  const chain: Array<{ name?: unknown; code?: unknown; statusCode?: unknown; isRetryable?: unknown; responseHeaders?: Record<string, string> }> = [];
  let cause = error;
  for (let i = 0; i < 3 && cause && typeof cause === "object"; i++) {
    chain.push(cause); cause = (cause as { cause?: unknown }).cause;
  }
  const statuses = chain.map((item) => item.statusCode).filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599);
  const status = statuses.find((value) => value === 401 || value === 402 || value === 403) ?? statuses[0];
  if (status === 401 || status === 402 || status === 403) return { kind: "configuration", retryable: false, status };
  if (timedOut || chain.some((item) => item.name === "TimeoutError")) return { kind: "timeout", retryable: true, status };
  if (chain.some((item) => ["AI_NoOutputGeneratedError", "AI_NoObjectGeneratedError", "AI_JSONParseError", "AI_TypeValidationError"].includes(String(item.name)))) {
    return { kind: "incomplete_output", retryable: true, status };
  }
  if (status === 429) {
    const headers = chain.find((item) => item.responseHeaders)?.responseHeaders;
    const rawMs = headers?.["retry-after-ms"];
    const rawSeconds = headers?.["retry-after"];
    const retryAfterMs = rawMs !== undefined ? Number(rawMs) : rawSeconds !== undefined ? Number(rawSeconds) * 1000 : 250;
    // Do not ignore a provider's long Retry-After or keep the user waiting indefinitely.
    return { kind: "rate_limit", retryable: Number.isFinite(retryAfterMs) && retryAfterMs >= 0 && retryAfterMs <= 1000, status, retryAfterMs };
  }
  if (status === 408 || status === 409 || status !== undefined && status >= 500 || chain.some((item) => item.isRetryable === true)) return { kind: "upstream", retryable: true, status };
  if (chain.some((item) => ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(String(item.code)))) return { kind: "transport", retryable: true, status };
  return { kind: status === undefined ? "unknown" : "invalid_request", retryable: false, status };
}

export async function readReceiptWithRecovery<T>(
  read: (input: { signal: AbortSignal; attempt: number; maxOutputTokens: number }) => Promise<T>,
  options: {
    signal: AbortSignal;
    onAttemptFailure?: (event: ReceiptReadAttemptEvent) => void;
    attemptTimeoutsMs?: readonly number[];
    retryDelayMs?: number;
  },
): Promise<{ data: T; attempts: number }> {
  const timeouts = (options.attemptTimeoutsMs ?? ATTEMPT_TIMEOUTS_MS).slice(0, 2);
  for (let index = 0; index < timeouts.length; index++) {
    options.signal.throwIfAborted();
    const startedAt = Date.now();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Receipt read attempt timed out", "TimeoutError")), timeouts[index]);
    const signal = AbortSignal.any([options.signal, deadline.signal]);
    try {
      // Reserve enough tokens for reasoning AND the final structured object.
      const data = await receiptTaskWithSignal(() => read({ signal, attempt: index + 1, maxOutputTokens: 4096 }), signal);
      signal.throwIfAborted();
      return { data, attempts: index + 1 };
    } catch (error) {
      options.signal.throwIfAborted(); // A closed/replaced form must never restart a read.
      const failure = receiptReadFailure(error, deadline.signal.aborted);
      const willRetry = failure.retryable && index + 1 < timeouts.length;
      options.onAttemptFailure?.({ attempt: index + 1, elapsedMs: Date.now() - startedAt, kind: failure.kind, status: failure.status, willRetry });
      if (!willRetry) throw error;
      const delay = failure.retryAfterMs ?? options.retryDelayMs ?? 250;
      if (delay > 0) await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(pause); reject(options.signal.reason); };
        const pause = setTimeout(() => { options.signal.removeEventListener("abort", onAbort); resolve(); }, delay);
        options.signal.addEventListener("abort", onAbort, { once: true });
        if (options.signal.aborted) { options.signal.removeEventListener("abort", onAbort); onAbort(); }
      });
    } finally { clearTimeout(timer); }
  }
  throw new Error("No receipt read attempt configured");
}
