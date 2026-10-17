import type { NextApiRequest, NextApiResponse } from "next";
import { bearerToken, isAuthorized } from "@/lib/auth";
import { withLock } from "@/lib/engine/lock";
import { allowMethods, parseInput, sendError } from "@/lib/http/api";
import { childIdSchema } from "@/lib/http/schemas";
import { profileView } from "@/lib/http/views";
import { childStore } from "@/lib/memory/store";

/**
 * Both require `Authorization: Bearer <parentToken>`.
 * GET    /api/children/:childId — progress, mood and safety flags (parent view)
 * DELETE /api/children/:childId — delete the profile and all its data
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;
  const childId = parseInput(res, childIdSchema, req.query.childId);
  if (!childId) return;

  const profile = await childStore.get(childId);
  if (!profile) return sendError(res, 404, "child_not_found", "No such child profile.");
  if (!isAuthorized(profile, bearerToken(req), "parent")) {
    return sendError(res, 401, "unauthorized", "A valid parent token is required.");
  }

  if (req.method === "DELETE") {
    // Under the child's lock, so an in-flight turn can't save the profile back afterwards.
    await withLock(childId, () => childStore.delete(childId));
    return res.status(204).end();
  }
  res.status(200).json(profileView(profile));
}
