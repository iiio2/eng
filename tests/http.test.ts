import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueTokens } from "@/lib/auth";
import { clientIp } from "@/lib/http/api";
import { RateLimiter } from "@/lib/http/rateLimit";
import { childStore, createProfile, InMemoryChildStore, StoreFullError } from "@/lib/memory/store";
import chatHandler from "@/pages/api/chat";
import childHandler from "@/pages/api/children/[childId]";
import createHandler from "@/pages/api/children/index";
import { makeAnalysis } from "./helpers";

const tutor = vi.hoisted(() => ({
  reply: ["Hello ", "friend!"] as string[],
  hang: false,
  /** When set, the stream pauses after the first token until it resolves. */
  gate: null as Promise<void> | null,
}));

vi.mock("@/lib/llm/tutor", () => ({
  streamTutorReply: (_input: unknown, signal?: AbortSignal) =>
    (async function* () {
      for (const [i, token] of tutor.reply.entries()) {
        yield token;
        if (i === 0 && tutor.gate) await tutor.gate;
      }
      if (tutor.hang) {
        await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
      }
    })(),
}));
vi.mock("@/lib/llm/analyzer", () => ({ analyzeMessage: async () => makeAnalysis() }));

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

let ipCounter = 0;

function mockReq(init: Partial<NextApiRequest> & { token?: string }): NextApiRequest {
  return {
    method: "POST",
    body: {},
    query: {},
    // A fresh IP per request keeps the module-level rate limiters out of the way.
    socket: { remoteAddress: `10.0.0.${++ipCounter % 250}` },
    ...init,
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
  } as unknown as NextApiRequest;
}

function mockRes() {
  const listeners: Record<string, (() => void)[]> = {};
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => (resolveEnded = resolve));
  const res = {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined as unknown,
    chunks: [] as string[],
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    ended,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader(key: string, value: unknown) {
      res.headers[key.toLowerCase()] = value;
    },
    json(data: unknown) {
      res.body = data;
      res.end();
      return res;
    },
    writeHead(code: number, headers: Record<string, unknown>) {
      res.statusCode = code;
      for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v;
      res.headersSent = true;
    },
    write(chunk: string) {
      res.headersSent = true;
      res.chunks.push(chunk);
      return true;
    },
    end() {
      res.headersSent = true;
      res.writableEnded = res.writableFinished = true;
      resolveEnded();
    },
    on(event: string, fn: () => void) {
      (listeners[event] ??= []).push(fn);
    },
    emit(event: string) {
      for (const fn of listeners[event] ?? []) fn();
    },
  };
  return res;
}

const asRes = (res: ReturnType<typeof mockRes>) => res as unknown as NextApiResponse;

function sseEvents(chunks: string[]) {
  return chunks.map((chunk) => {
    const [, event, data] = chunk.match(/^event: (.*)\ndata: (.*)\n\n$/) ?? [];
    return { event, data: JSON.parse(data) };
  });
}

async function seedChild() {
  const { tokens, auth } = issueTokens();
  const profile = createProfile({ childId: crypto.randomUUID(), auth });
  await childStore.save(profile);
  return { childId: profile.childId, ...tokens };
}

beforeEach(() => {
  tutor.reply = ["Hello ", "friend!"];
  tutor.hang = false;
  tutor.gate = null;
});

describe("POST /api/children", () => {
  it("creates a profile and returns its tokens once", async () => {
    const res = mockRes();
    await createHandler(mockReq({ body: { name: "Mia", age: 5 } }), asRes(res));
    const body = res.body as Record<string, unknown>;
    expect(res.statusCode).toBe(201);
    expect(body).toMatchObject({ name: "Mia", age: 5 });
    expect(typeof body.chatToken).toBe("string");
    expect(typeof body.parentToken).toBe("string");
    expect(body).not.toHaveProperty("auth");
  });

  it("rate-limits profile creation per IP", async () => {
    const socket = { remoteAddress: "192.168.1.1" };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = mockRes();
      await createHandler(mockReq({ socket } as Partial<NextApiRequest>), asRes(res));
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("POST /api/chat", () => {
  it("streams start, token and done events as SSE", async () => {
    const child = await seedChild();
    const res = mockRes();
    await chatHandler(mockReq({ body: { childId: child.childId, message: "hi" }, token: child.chatToken }), asRes(res));

    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["cache-control"]).toContain("no-transform");
    const events = sseEvents(res.chunks);
    expect(events.map((e) => e.event)).toEqual(["start", "token", "token", "done"]);
    expect(events[0].data).toEqual({ mode: "conversation", reason: "session-start", level: 1 });
    expect(events.at(-1)?.data).toMatchObject({ reply: "Hello friend!", analysisPending: false });
    expect(res.writableEnded).toBe(true);
  });

  it("returns one JSON body with stream:false", async () => {
    const child = await seedChild();
    const res = mockRes();
    await chatHandler(
      mockReq({ body: { childId: child.childId, message: "hi", stream: false }, token: child.chatToken }),
      asRes(res),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ reply: "Hello friend!", mode: "conversation" });
  });

  it("requires a valid token", async () => {
    const child = await seedChild();
    for (const token of [undefined, "wrong"]) {
      const res = mockRes();
      await chatHandler(mockReq({ body: { childId: child.childId, message: "hi" }, token }), asRes(res));
      expect(res.statusCode).toBe(401);
    }
  });

  it("answers 404 as JSON for unknown children, and 400 for bad input", async () => {
    const notFound = mockRes();
    await chatHandler(mockReq({ body: { childId: "nobody", message: "hi" }, token: "x" }), asRes(notFound));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.body).toMatchObject({ error: { code: "child_not_found" } });

    const invalid = mockRes();
    await chatHandler(mockReq({ body: { childId: "bad id!", message: "" } }), asRes(invalid));
    expect(invalid.statusCode).toBe(400);
  });

  it("rejects other methods with 405", async () => {
    const res = mockRes();
    await chatHandler(mockReq({ method: "GET" }), asRes(res));
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });

  it("does not write after the client disconnects, and still saves the turn", async () => {
    const child = await seedChild();
    tutor.hang = true;
    const res = mockRes();
    const pending = chatHandler(
      mockReq({ body: { childId: child.childId, message: "hi" }, token: child.chatToken }),
      asRes(res),
    );
    await vi.waitFor(() => expect(res.chunks.length).toBeGreaterThanOrEqual(3));
    res.emit("close");
    await pending;

    expect(sseEvents(res.chunks).map((e) => e.event)).not.toContain("done");
    const saved = await childStore.get(child.childId);
    expect(saved?.history.map((m) => m.content)).toEqual(["hi", "Hello friend!"]);
  });
});

describe("GET/DELETE /api/children/:childId", () => {
  it("requires the parent token (the chat token is not enough)", async () => {
    const child = await seedChild();
    const withChat = mockRes();
    await childHandler(mockReq({ method: "GET", query: { childId: child.childId }, token: child.chatToken }), asRes(withChat));
    expect(withChat.statusCode).toBe(401);

    const withParent = mockRes();
    await childHandler(mockReq({ method: "GET", query: { childId: child.childId }, token: child.parentToken }), asRes(withParent));
    expect(withParent.statusCode).toBe(200);
    expect(withParent.body).toMatchObject({ childId: child.childId });
    expect(withParent.body).not.toHaveProperty("auth");
  });

  it("waits for an in-flight turn, so deletion sticks", async () => {
    const child = await seedChild();
    let release!: () => void;
    tutor.gate = new Promise<void>((resolve) => (release = resolve));
    const chatRes = mockRes();
    const turn = chatHandler(
      mockReq({ body: { childId: child.childId, message: "hi" }, token: child.chatToken }),
      asRes(chatRes),
    );
    // The turn has loaded the profile and is mid-reply.
    await vi.waitFor(() => expect(sseEvents(chatRes.chunks).map((e) => e.event)).toContain("token"));

    const delRes = mockRes();
    const deletion = childHandler(
      mockReq({ method: "DELETE", query: { childId: child.childId }, token: child.parentToken }),
      asRes(delRes),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await Promise.all([turn, deletion]);

    expect(delRes.statusCode).toBe(204);
    expect(await childStore.get(child.childId)).toBeNull();
  });
});

describe("clientIp", () => {
  const req = (xff: string) =>
    ({ headers: { "x-forwarded-for": xff }, socket: { remoteAddress: "10.1.1.1" } }) as unknown as NextApiRequest;

  it("ignores X-Forwarded-For unless proxies are trusted", () => {
    expect(clientIp(req("6.6.6.6"), 0)).toBe("10.1.1.1");
  });

  it("takes the entry added by the trusted proxy, not the spoofable first one", () => {
    expect(clientIp(req("6.6.6.6, 203.0.113.7"), 1)).toBe("203.0.113.7");
    expect(clientIp(req("6.6.6.6, 203.0.113.7, 10.0.0.2"), 2)).toBe("203.0.113.7");
  });
});

describe("RateLimiter", () => {
  it("limits per window and resets after it", () => {
    const limiter = new RateLimiter(2, 1000);
    expect([limiter.take("a", 0), limiter.take("a", 1), limiter.take("a", 2)]).toEqual([true, true, false]);
    expect(limiter.take("a", 1000)).toBe(true);
  });

  it("caps the number of tracked keys", () => {
    const limiter = new RateLimiter(1, 60_000, 2);
    limiter.take("a", 0);
    limiter.take("b", 1);
    limiter.take("c", 2); // evicts "a"
    expect(limiter.take("a", 3)).toBe(true);
    expect((limiter as unknown as { windows: Map<string, unknown> }).windows.size).toBe(2);
  });
});

describe("InMemoryChildStore", () => {
  it("refuses new profiles beyond its cap but still updates existing ones", async () => {
    const store = new InMemoryChildStore(1);
    const first = createProfile({ childId: "a" });
    await store.save(first);
    await expect(store.save(createProfile({ childId: "b" }))).rejects.toBeInstanceOf(StoreFullError);
    await expect(store.save({ ...first, name: "Mia" })).resolves.toBeUndefined();
  });
});
