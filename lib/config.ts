function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Model defaults favour low time-to-first-token: non-reasoning models keep
 * end-to-end latency well under the 2s budget.
 */
export const config = {
  botName: process.env.BOT_NAME ?? "Pip",

  tutorModel: process.env.OPENAI_TUTOR_MODEL ?? "gpt-4.1-mini",
  analyzerModel: process.env.OPENAI_ANALYZER_MODEL ?? "gpt-4.1-nano",
  tutorMaxTokens: intFromEnv("TUTOR_MAX_TOKENS", 120),

  /** No first token by then → send the fallback reply instead of making the child wait. */
  firstTokenTimeoutMs: intFromEnv("FIRST_TOKEN_TIMEOUT_MS", 2500),
  /** Max silence between streamed tokens before the reply is cut off. */
  streamIdleTimeoutMs: intFromEnv("STREAM_IDLE_TIMEOUT_MS", 2000),
  /** `done` is sent within this budget; a later analysis is still applied and saved. */
  responseBudgetMs: intFromEnv("RESPONSE_BUDGET_MS", 1800),
  /** Hard cap on the background analyzer call. */
  analyzerTimeoutMs: intFromEnv("ANALYZER_TIMEOUT_MS", 4000),

  /** Messages kept in the stored history, and how many of them the tutor sees. */
  historyStored: 20,
  historyForTutor: 8,

  /** After this many learning turns in a row, take a conversation break. */
  learningStreakLimit: 4,
  /** A gap longer than this starts a new session. */
  sessionGapMs: 30 * 60 * 1000,

  maxMessageLength: 500,
  rateLimitPerMinute: intFromEnv("RATE_LIMIT_PER_MINUTE", 30),
  ipRateLimitPerMinute: intFromEnv("IP_RATE_LIMIT_PER_MINUTE", 60),
  profileCreatesPerHour: intFromEnv("PROFILE_CREATES_PER_HOUR", 10),
  maxProfiles: intFromEnv("MAX_PROFILES", 10_000),
  /**
   * Number of trusted reverse proxies in front of the app. 0 = ignore
   * X-Forwarded-For entirely (it is client-controlled without a proxy).
   */
  trustProxyHops: intFromEnv("TRUST_PROXY_HOPS", 0),
} as const;
