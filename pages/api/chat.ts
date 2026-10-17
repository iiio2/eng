import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { bearerToken, isAuthorized } from "@/lib/auth";
import { config as appConfig } from "@/lib/config";
import { ChildNotFoundError, runTurn, type TurnHandlers } from "@/lib/engine/turn";
import { allowMethods, clientIp, parseInput, sendError } from "@/lib/http/api";
import { RateLimiter } from "@/lib/http/rateLimit";
import { childIdSchema } from "@/lib/http/schemas";
import { childStore } from "@/lib/memory/store";

export const config = {
  api: { bodyParser: { sizeLimit: "16kb" } },
};

const bodySchema = z.object({
  childId: childIdSchema,
  message: z.string().trim().min(1).max(appConfig.maxMessageLength),
  /** Stream tokens as Server-Sent Events (default) or return one JSON response. */
  stream: z.boolean().default(true),
});

const ipLimiter = new RateLimiter(appConfig.ipRateLimitPerMinute, 60_000);
const childLimiter = new RateLimiter(appConfig.rateLimitPerMinute, 60_000);

/**
 * POST /api/chat — requires `Authorization: Bearer <chatToken | parentToken>`.
 *
 * Streaming (default) responds with `text/event-stream` events:
 *   start  {mode, reason, level}        — as soon as the mode is chosen
 *   token  {text}                       — reply text chunks
 *   done   {reply, mode, level, ...}    — within the response budget
 *   error  {code, message}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!ipLimiter.take(clientIp(req))) return rateLimited(res);
  const body = parseInput(res, bodySchema, req.body);
  if (!body) return;

  const profile = await childStore.get(body.childId);
  if (!profile) return notFound(res);
  if (!isAuthorized(profile, bearerToken(req), "chat")) {
    return sendError(res, 401, "unauthorized", "A valid chat token is required.");
  }
  if (!childLimiter.take(body.childId)) return rateLimited(res);

  // Stop generating if the client goes away mid-stream.
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) abort.abort();
  });

  if (!body.stream) {
    try {
      await runTurn(body.childId, body.message, {
        onDone: (result) => {
          if (!abort.signal.aborted) res.status(200).json(result);
        },
      }, { signal: abort.signal });
    } catch (error) {
      if (abort.signal.aborted) return;
      if (!res.headersSent) return handleError(res, error);
      console.error("[chat] post-response work failed", error);
    }
    return;
  }

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const handlers: TurnHandlers = {
    // Headers go out only once the turn starts, so earlier errors can still be JSON.
    onStart: (start) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        // no-transform stops compression middleware from buffering the stream.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      send("start", start);
    },
    onToken: (text) => send("token", { text }),
    onDone: (result) => {
      send("done", result);
      res.end();
    },
  };

  try {
    await runTurn(body.childId, body.message, handlers, { signal: abort.signal });
  } catch (error) {
    if (abort.signal.aborted) return;
    if (!res.headersSent) return handleError(res, error);
    console.error("[chat] turn failed", error);
    send("error", { code: "internal_error", message: "Something went wrong." });
    if (!res.writableEnded) res.end();
  }
}

function rateLimited(res: NextApiResponse) {
  res.setHeader("Retry-After", "60");
  return sendError(res, 429, "rate_limited", "Too many messages. Please wait a moment.");
}

function notFound(res: NextApiResponse) {
  return sendError(res, 404, "child_not_found", "Create a child profile first via POST /api/children.");
}

function handleError(res: NextApiResponse, error: unknown) {
  // The profile can be deleted between the auth check and the turn.
  if (error instanceof ChildNotFoundError) return notFound(res);
  console.error("[chat] failed", error);
  return sendError(res, 500, "internal_error", "Something went wrong.");
}
