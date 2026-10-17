import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { issueTokens } from "@/lib/auth";
import { config } from "@/lib/config";
import { allowMethods, clientIp, parseInput, sendError } from "@/lib/http/api";
import { RateLimiter } from "@/lib/http/rateLimit";
import { profileView } from "@/lib/http/views";
import { childStore, createProfile, StoreFullError } from "@/lib/memory/store";

const bodySchema = z.object({
  /** First name only — never collect more personal data than needed. */
  name: z.string().trim().min(1).max(30).optional(),
  age: z.number().int().min(2).max(10).optional(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

const createLimiter = new RateLimiter(config.profileCreatesPerHour, 60 * 60_000);

/**
 * POST /api/children — create a child profile.
 * The response includes `chatToken` and `parentToken`; they are shown only once.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!createLimiter.take(clientIp(req))) {
    res.setHeader("Retry-After", "3600");
    return sendError(res, 429, "rate_limited", "Too many profiles created. Try again later.");
  }
  const body = parseInput(res, bodySchema, req.body);
  if (!body) return;

  const { tokens, auth } = issueTokens();
  const profile = createProfile({ childId: randomUUID(), ...body, auth });
  try {
    await childStore.save(profile);
  } catch (error) {
    if (error instanceof StoreFullError) {
      return sendError(res, 503, "capacity_reached", "No room for new profiles right now.");
    }
    throw error;
  }
  res.status(201).json({ ...profileView(profile), ...tokens });
}
