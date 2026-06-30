const DEFAULT_FAST_DATA_TIMEOUT_MS = 250;

export async function fastOr<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = DEFAULT_FAST_DATA_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch((error) => {
        console.error("fast data load failed", error);
        return fallback;
      }),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
