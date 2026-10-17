import { afterEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "@/lib/client/format";
import { pickVoice, SentenceChunker, toSpeakable } from "@/lib/client/speech";
import { createSseParser } from "@/lib/client/sse";
import { clearSession, loadChatState, loadPrefs, loadSession, saveChatState, saveSession } from "@/lib/client/storage";

describe("createSseParser", () => {
  it("parses events, including ones split across chunks", () => {
    const parse = createSseParser();
    expect(parse('event: start\ndata: {"mode":"learning"}\n\nevent: tok')).toEqual([
      { event: "start", data: { mode: "learning" } },
    ]);
    expect(parse('en\ndata: {"text":"Hi"}\n')).toEqual([]);
    expect(parse("\n")).toEqual([{ event: "token", data: { text: "Hi" } }]);
  });

  it("handles CRLF, comments and multi-line data", () => {
    const parse = createSseParser();
    expect(parse(': keep-alive\r\n\r\nevent: done\r\ndata: {"a":\r\ndata: 1}\r\n\r\n')).toEqual([
      { event: "done", data: { a: 1 } },
    ]);
  });
});

describe("SentenceChunker", () => {
  it("emits sentences as soon as they complete", () => {
    const chunker = new SentenceChunker();
    expect(chunker.push("Hello Mia")).toEqual([]);
    expect(chunker.push("! What col")).toEqual(["Hello Mia!"]);
    expect(chunker.push("or is the sky? ")).toEqual(["What color is the sky?"]);
    expect(chunker.push("Blue")).toEqual([]);
    expect(chunker.flush()).toBe("Blue");
    expect(chunker.flush()).toBeNull();
  });

  it("does not pause after titles and abbreviations", () => {
    const chunker = new SentenceChunker();
    expect(chunker.push("Mr. Fox found a ball. Dr. Owl ")).toEqual(["Mr. Fox found a ball."]);
    expect(chunker.push("smiled! ")).toEqual(["Dr. Owl smiled!"]);
  });

  it("keeps closing quotes with their sentence", () => {
    const chunker = new SentenceChunker();
    expect(chunker.push('Say "hello." Now ')).toEqual(['Say "hello."']);
  });
});

describe("toSpeakable", () => {
  it("removes emoji and markdown symbols", () => {
    expect(toSpeakable("Yay! 🎉 You said *red* 👍🏽")).toBe("Yay! You said red");
    expect(toSpeakable("Count: 1, 2, 3 #fun")).toBe("Count: 1, 2, 3 fun");
  });
});

describe("pickVoice", () => {
  const voice = (name: string, lang: string, localService = true) =>
    ({ name, lang, localService }) as SpeechSynthesisVoice;

  it("prefers known friendly English voices, then any en-US voice", () => {
    expect(pickVoice([voice("Thomas", "fr-FR"), voice("Samantha", "en-US")])?.name).toBe("Samantha");
    expect(pickVoice([voice("Other", "en-GB"), voice("Alex", "en-US")])?.name).toBe("Alex");
    expect(pickVoice([voice("Thomas", "fr-FR")])).toBeNull();
  });
});

describe("timeAgo", () => {
  it("formats recent times for parents", () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(timeAgo(now - 26 * 3_600_000, now)).toBe("yesterday");
  });
});

describe("storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
    });
    return data;
  }

  it("round-trips the session and caps the transcript", () => {
    stubStorage();
    saveSession({ childId: "c1", name: "Mia", chatToken: "t1", parentToken: "p1" });
    expect(loadSession()).toEqual({ childId: "c1", name: "Mia", chatToken: "t1", parentToken: "p1" });

    const messages = Array.from({ length: 50 }, (_, i) => ({ id: String(i), role: "child" as const, text: "hi" }));
    saveChatState("c1", { messages, level: 2 });
    expect(loadChatState("c1").messages).toHaveLength(40);
    expect(loadChatState("c1").level).toBe(2);

    clearSession("c1");
    expect(loadSession()).toBeNull();
    expect(loadChatState("c1")).toEqual({ messages: [], level: null });
  });

  it("never shows one child's chat to another profile", () => {
    stubStorage();
    saveChatState("c1", { messages: [{ id: "1", role: "child", text: "secret" }], level: 1 });
    expect(loadChatState("c2")).toEqual({ messages: [], level: null });
  });

  it("clearSession only removes the child it was asked to (stale tabs)", () => {
    stubStorage();
    saveSession({ childId: "new", name: null, chatToken: "t", parentToken: "p" });
    saveChatState("new", { messages: [], level: 1 });
    clearSession("old");
    expect(loadSession()?.childId).toBe("new");
    expect(loadChatState("new").level).toBe(1);
  });

  it("works without storage (private mode, blocked site data)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => saveSession({ childId: "c1", name: null, chatToken: "t", parentToken: "p" })).not.toThrow();
    expect(loadSession()).toBeNull();
    expect(loadPrefs()).toEqual({ sound: true });
  });
});
