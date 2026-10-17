/**
 * Fixed-window, in-memory rate limiter with a hard cap on tracked keys.
 * Good enough for a single instance; use a shared store (e.g. Redis) when
 * running several.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  /** Returns true if the request is allowed. */
  take(key: string, now = Date.now()): boolean {
    const window = this.windows.get(key);
    if (window && now - window.start < this.windowMs) {
      window.count += 1;
      return window.count <= this.limit;
    }
    // Re-insert so Map order stays oldest-window-first, which makes eviction cheap.
    this.windows.delete(key);
    this.windows.set(key, { start: now, count: 1 });
    this.evict(now);
    return true;
  }

  private evict(now: number) {
    for (const [key, window] of this.windows) {
      const expired = now - window.start >= this.windowMs;
      if (!expired && this.windows.size <= this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}
