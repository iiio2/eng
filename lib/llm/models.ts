import { ChatOpenAI } from "@langchain/openai";
import { config } from "@/lib/config";

/**
 * Lazily-created singletons: reusing one client keeps HTTP connections warm
 * (saves a TLS handshake per turn), and lazy creation lets modules load
 * without an API key (e.g. in tests).
 */
let tutor: ChatOpenAI | undefined;
let analyzer: ChatOpenAI | undefined;

export function getTutorModel(): ChatOpenAI {
  return (tutor ??= new ChatOpenAI({
    model: config.tutorModel,
    temperature: 0.7,
    maxTokens: config.tutorMaxTokens,
    streaming: true,
    // Covers the wait for response headers only; turn.ts enforces first-token
    // and between-token deadlines itself. No retries: a retry can't fit the budget.
    timeout: config.firstTokenTimeoutMs,
    maxRetries: 0,
  }));
}

export function getAnalyzerModel(): ChatOpenAI {
  return (analyzer ??= new ChatOpenAI({
    model: config.analyzerModel,
    temperature: 0,
    maxTokens: 200,
    timeout: config.analyzerTimeoutMs,
    maxRetries: 0,
  }));
}
