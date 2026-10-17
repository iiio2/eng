import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueTokens } from "@/lib/auth";
import { ApiError, StreamInterruptedError, streamChat } from "@/lib/client/api";
import { childStore, createProfile } from "@/lib/memory/store";
import chatHandler from "@/pages/api/chat";
import { makeAnalysis } from "./helpers";

vi.mock("@/lib/llm/tutor", () => ({
  streamTutorReply: async function* () {
    yield "Hello ";
    yield "friend!";
  },
}));
vi.mock("@/lib/llm/analyzer", () => ({ analyzeMessage: async () => makeAnalysis() }));
vi.spyOn(console, "info").mockImplementation(() => {});

afterEach(() => vi.unstubAllGlobals());

/** Runs the real /api/chat handler and returns the exact bytes it streamed. */
async function realChatStream(message: string): Promise<string[]> {
  const { tokens, auth } = issueTokens();
  const profile = createProfile({ childId: crypto.randomUUID(), auth });
  await childStore.save(profile);
  const chunks: string[] = [];
  const res = {
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    writeHead() {
      res.headersSent = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      res.writableEnded = res.writableFinished = true;
    },
    on() {},
    setHeader() {},
    status() {
      return res;
    },
    json() {},
  };
  const req = {
    method: "POST",
    body: { childId: profile.childId, message },
    headers: { authorization: `Bearer ${tokens.chatToken}` },
    socket: { remoteAddress: "10.9.9.9" },
    query: {},
  };
  await chatHandler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return chunks;
}

/** A fetch that answers with a stream of the given chunks, split at awkward points. */
function stubFetchWithStream(chunks: string[], { failAfter }: { failAfter?: number } = {}) {
  const bytes = new TextEncoder().encode(chunks.join(""));
  const cut = failAfter ?? bytes.length;
  let offset = 0;
  // Pull-based so queued pieces are read before an error (error() discards queued chunks).
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < cut) {
        // 7-byte pieces so events are split across reads.
        controller.enqueue(bytes.slice(offset, Math.min(offset + 7, cut)));
        offset += 7;
      } else if (failAfter !== undefined) controller.error(new TypeError("network lost"));
      else controller.close();
    },
  });
  vi.stubGlobal("fetch", async () => new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
}

const stubFetchWith = (status: number, body: string, headers: Record<string, string> = {}) =>
  vi.stubGlobal("fetch", async () => new Response(body, { status, headers }));

describe("streamChat against the real /api/chat handler", () => {
  it("parses start, tokens and done exactly as the server writes them", async () => {
    stubFetchWithStream(await realChatStream("hi"));
    const onStart = vi.fn();
    const tokens: string[] = [];

    const result = await streamChat({
      childId: "x",
      token: "t",
      message: "hi",
      onStart,
      onToken: (t) => tokens.push(t),
    });

    expect(onStart).toHaveBeenCalledWith({ mode: "conversation", reason: "session-start", level: 1 });
    expect(tokens.join("")).toBe("Hello friend!");
    expect(result).toMatchObject({ reply: "Hello friend!", mode: "conversation", analysisPending: false });
  });

  it("reports a drop after the turn started as interrupted (already saved, don't re-send)", async () => {
    const chunks = await realChatStream("hi");
    const startLength = new TextEncoder().encode(chunks[0]).length;
    stubFetchWithStream(chunks, { failAfter: startLength + 5 });

    await expect(streamChat({ childId: "x", token: "t", message: "hi" })).rejects.toBeInstanceOf(
      StreamInterruptedError,
    );
  });

  it("reports a stream that ends without done as interrupted", async () => {
    const chunks = await realChatStream("hi");
    stubFetchWithStream(chunks.slice(0, -1));
    await expect(streamChat({ childId: "x", token: "t", message: "hi" })).rejects.toBeInstanceOf(
      StreamInterruptedError,
    );
  });
});

describe("API errors", () => {
  it("treats only the app's own errors as a lost session", async () => {
    stubFetchWith(404, JSON.stringify({ error: { code: "child_not_found", message: "x" } }));
    const appError = await streamChat({ childId: "x", token: "t", message: "hi" }).catch((e) => e);
    expect(appError).toBeInstanceOf(ApiError);
    expect(appError.sessionLost).toBe(true);

    stubFetchWith(404, "<html>Not found</html>", { "Content-Type": "text/html" });
    const proxyError = await streamChat({ childId: "x", token: "t", message: "hi" }).catch((e) => e);
    expect(proxyError.sessionLost).toBe(false);

    stubFetchWith(401, "Unauthorized");
    expect((await streamChat({ childId: "x", token: "t", message: "hi" }).catch((e) => e)).sessionLost).toBe(false);
  });

  it("exposes Retry-After on rate limits", async () => {
    stubFetchWith(429, JSON.stringify({ error: { code: "rate_limited", message: "x" } }), { "Retry-After": "60" });
    const error = await streamChat({ childId: "x", token: "t", message: "hi" }).catch((e) => e);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });
});
