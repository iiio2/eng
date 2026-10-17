import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextApiRequest } from "next";
import type { ChildProfile } from "@/lib/types";

/**
 * Capability tokens until parent accounts exist. Each profile gets two:
 * - chat token:   lives on the child's device; can only chat.
 * - parent token: for the parent view and deletion (also allowed to chat).
 * Only SHA-256 hashes are stored.
 */
export type Role = "chat" | "parent";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function matches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueTokens() {
  const chatToken = newToken();
  const parentToken = newToken();
  return {
    tokens: { chatToken, parentToken },
    auth: { chatTokenHash: hashToken(chatToken), parentTokenHash: hashToken(parentToken) },
  };
}

export function bearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  const match = header?.match(/^Bearer (\S+)$/i);
  return match ? match[1] : null;
}

export function isAuthorized(profile: ChildProfile, token: string | null, role: Role): boolean {
  if (!token) return false;
  if (matches(token, profile.auth.parentTokenHash)) return true;
  return role === "chat" && matches(token, profile.auth.chatTokenHash);
}

/** Short, non-reversible id for logs. */
export function logId(childId: string): string {
  return hashToken(childId).slice(0, 12);
}
