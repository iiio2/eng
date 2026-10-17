import type { NextApiRequest, NextApiResponse } from "next";
import type { z } from "zod";
import { config } from "@/lib/config";

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export function sendError(
  res: NextApiResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  res.status(status).json({ error: { code, message, details } } satisfies ApiError);
}

export function allowMethods(req: NextApiRequest, res: NextApiResponse, methods: string[]): boolean {
  if (req.method && methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  sendError(res, 405, "method_not_allowed", `Use ${methods.join(" or ")}.`);
  return false;
}

/** Validates input against a schema; sends a 400 and returns null when invalid. */
export function parseInput<T>(res: NextApiResponse, schema: z.ZodType<T>, input: unknown): T | null {
  const parsed = schema.safeParse(input ?? {});
  if (parsed.success) return parsed.data;
  sendError(
    res,
    400,
    "invalid_request",
    "Request is invalid.",
    parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
  return null;
}

/**
 * The caller's IP. X-Forwarded-For is client-controlled, so it is only used
 * behind `trustProxyHops` trusted proxies — taking the entry the outermost
 * trusted proxy appended, not the (spoofable) first one.
 */
export function clientIp(req: NextApiRequest, trustProxyHops = config.trustProxyHops): string {
  const socketIp = req.socket.remoteAddress || "unknown";
  if (trustProxyHops <= 0) return socketIp;
  const header = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(header) ? header.join(",") : (header ?? ""))
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.length >= trustProxyHops ? hops[hops.length - trustProxyHops] : socketIp;
}
