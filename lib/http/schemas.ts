import { z } from "zod";

export const childIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "childId must be 1–64 letters, digits, '-' or '_'.");
