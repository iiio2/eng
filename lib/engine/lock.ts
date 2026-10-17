const tails = new Map<string, Promise<void>>();

/**
 * Serialises async work per key, so two quick messages from the same child
 * can't read-modify-write their profile concurrently. Single-process only;
 * a multi-instance deployment needs a distributed lock (e.g. Redis).
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => current);
  tails.set(key, tail);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
