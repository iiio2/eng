import { createSseParser } from "@/lib/client/sse";
import type { TurnResult, TurnStart } from "@/lib/engine/turn";
import type { profileView } from "@/lib/http/views";
import type { Level } from "@/lib/types";

export type ChildView = ReturnType<typeof profileView>;
export type CreatedChild = ChildView & { chatToken: string; parentToken: string };
export type { TurnResult, TurnStart };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** From Retry-After on 429 responses. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * The profile is gone (server restarted with in-memory storage) or the token
   * is invalid. Only the app's own JSON errors count: a 401/404 page from a
   * proxy, CDN or deploy must not wipe the device's tokens.
   */
  get sessionLost() {
    return this.code === "child_not_found" || this.code === "unauthorized";
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "", 10);
  const retryAfterSeconds = Number.isFinite(retryAfter) ? retryAfter : null;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      res.status,
      body.error?.code ?? "error",
      body.error?.message ?? res.statusText,
      retryAfterSeconds,
    );
  } catch {
    return new ApiError(res.status, "error", res.statusText, retryAfterSeconds);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function createChild(input: { name?: string; age?: number; level?: Level }) {
  return request<CreatedChild>("/api/children", { method: "POST", body: JSON.stringify(input) });
}

export function getChild(childId: string, parentToken: string) {
  return request<ChildView>(`/api/children/${encodeURIComponent(childId)}`, { token: parentToken });
}

export function deleteChild(childId: string, parentToken: string) {
  return request<void>(`/api/children/${encodeURIComponent(childId)}`, {
    method: "DELETE",
    token: parentToken,
  });
}

export interface StreamChatOptions {
  childId: string;
  token: string;
  message: string;
  signal?: AbortSignal;
  onStart?: (start: TurnStart) => void;
  onToken?: (text: string) => void;
}

/** Failure after the server started the turn: it is already saved, so it must not be re-sent. */
export class StreamInterruptedError extends Error {
  constructor(cause: unknown) {
    super("The reply was interrupted", { cause });
    this.name = "StreamInterruptedError";
  }
}

/** Sends one message and streams the reply; resolves with the `done` result. */
export async function streamChat(opts: StreamChatOptions): Promise<TurnResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ childId: opts.childId, message: opts.message }),
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(0, "no_stream", "Streaming is not supported here.");

  const parse = createSseParser();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let started = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const { event, data } of parse(value)) {
        if (event === "start") {
          started = true;
          opts.onStart?.(data as TurnStart);
        } else if (event === "token") opts.onToken?.((data as { text: string }).text);
        else if (event === "done") return data as TurnResult;
        else if (event === "error") {
          const { code, message } = data as { code: string; message: string };
          throw new ApiError(500, code, message);
        }
      }
    }
    throw new ApiError(0, "incomplete", "The reply was cut off.");
  } catch (error) {
    if (opts.signal?.aborted || !started) throw error;
    throw new StreamInterruptedError(error);
  } finally {
    reader.cancel().catch(() => {});
  }
}
