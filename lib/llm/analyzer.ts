import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getAnalyzerModel } from "@/lib/llm/models";
import { ANALYZER_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { MOODS } from "@/lib/types";

// OpenAI strict JSON schema: every field required, optional values are nullable.
export const analysisSchema = z.object({
  mood: z.enum(MOODS),
  engagement: z.enum(["low", "medium", "high"]),
  intent: z.enum([
    "answer",
    "share",
    "question",
    "request_play",
    "request_learn",
    "refuse",
    "greeting",
    "other",
  ]),
  // Which item was asked is known deterministically (lib/engine/answers.ts),
  // so the analyzer only judges the answer.
  answer: z.object({
    result: z.enum(["correct", "partial", "incorrect", "not_an_answer"]),
  }),
  interests: z.array(z.string()),
  childName: z.string().nullable(),
  safetyConcern: z.boolean(),
  note: z.string().nullable(),
});

export type Analysis = z.infer<typeof analysisSchema>;

export interface AnalyzerInput {
  childMessage: string;
  lastBotMessage: string | null;
  target: { skillTitle: string; item: string; pattern: string | null } | null;
}

export function buildAnalyzerUserMessage(input: AnalyzerInput): string {
  const lines = [`Tutor's last message: ${JSON.stringify(input.lastBotMessage ?? "(none)")}`];
  if (input.target) {
    lines.push(`Practice skill: ${input.target.skillTitle}. Expected answer: ${JSON.stringify(input.target.item)}.`);
    if (input.target.pattern) {
      lines.push(
        `Grading: any sentence using the pattern ${JSON.stringify(input.target.pattern)} correctly is "correct", with any words in the blanks.`,
      );
    }
  } else {
    lines.push("No practice question was asked.");
  }
  lines.push(`Child's message: ${JSON.stringify(input.childMessage)}`);
  return lines.join("\n");
}

let chain: ReturnType<typeof buildChain> | undefined;

function buildChain() {
  return getAnalyzerModel().withStructuredOutput(analysisSchema, {
    name: "child_message_analysis",
    method: "jsonSchema",
    strict: true,
  });
}

export async function analyzeMessage(input: AnalyzerInput, signal?: AbortSignal): Promise<Analysis> {
  chain ??= buildChain();
  const result = await chain.invoke(
    [new SystemMessage(ANALYZER_SYSTEM_PROMPT), new HumanMessage(buildAnalyzerUserMessage(input))],
    { signal },
  );
  return analysisSchema.parse(result);
}
