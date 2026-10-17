import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { getTutorModel } from "@/lib/llm/models";
import type { ChatMessage } from "@/lib/types";

export interface TutorInput {
  systemPrompt: string;
  history: ChatMessage[];
  childMessage: string;
}

export function buildTutorMessages(input: TutorInput): BaseMessage[] {
  return [
    new SystemMessage(input.systemPrompt),
    ...input.history.map((m) =>
      m.role === "child" ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
    new HumanMessage(input.childMessage),
  ];
}

export async function* streamTutorReply(
  input: TutorInput,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = await getTutorModel().stream(buildTutorMessages(input), { signal });
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
