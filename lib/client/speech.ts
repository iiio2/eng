/** Text as it should be read aloud: no emoji or symbols that voices spell out. */
export function toSpeakable(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_~`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|vs|etc|e\.g|i\.e)\.$/i;

/**
 * Splits a streaming reply into whole sentences, so the first sentence can be
 * spoken while the rest is still arriving.
 */
export class SentenceChunker {
  private buffer = "";

  /** Adds streamed text; returns any sentences that are now complete. */
  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];
    const boundary = /[.!?]+["')\]]*\s+/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(this.buffer))) {
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(start, end).trim();
      // "Mr. Fox" is one sentence: don't pause after a title or "e.g.".
      if (ABBREVIATION.test(sentence)) continue;
      if (sentence) sentences.push(sentence);
      start = end;
    }
    this.buffer = this.buffer.slice(start);
    return sentences;
  }

  /** Returns whatever is left once the reply has finished. */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }
}

/** Prefer a clear, natural English voice; fall back to any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const preferred = ["Samantha", "Google US English", "Microsoft Aria", "Microsoft Jenny", "Karen", "Moira"];
  for (const name of preferred) {
    const voice = english.find((v) => v.name.includes(name));
    if (voice) return voice;
  }
  return english.find((v) => v.lang === "en-US" && v.localService) ?? english.find((v) => v.lang === "en-US") ?? english[0] ?? null;
}
