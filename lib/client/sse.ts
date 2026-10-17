export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Incremental Server-Sent Events parser: feed decoded text chunks as they
 * arrive, get back the events completed so far. Handles events split across
 * chunks, CRLF line endings, comments and multi-line data.
 */
export function createSseParser() {
  let buffer = "";

  return function parse(chunk: string): SseEvent[] {
    buffer += chunk.replace(/\r\n?/g, "\n");
    const events: SseEvent[] = [];
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) events.push({ event, data: JSON.parse(data.join("\n")) });
    }
    return events;
  };
}
