import type { ChatProblem } from "@/hooks/useChat";
import type { MicError } from "@/hooks/useSpeechRecognition";

// Shown and spoken: children who can't read yet hear these from Pip.

export const PROBLEM_TEXT: Record<ChatProblem, string> = {
  network: "Oops! I couldn't hear you. Let's try again!",
  busy: "Whoa, so many words! Let's rest for a moment, then try again.",
  server: "Something went a little wobbly. Let's try again!",
  dropped: "Oops, I lost my words for a moment! Let's keep talking.",
};

export const MIC_ERROR_TEXT: Record<MicError, string> = {
  denied: "Ask a grown-up to let me use the microphone. You can type too!",
  "no-speech": "I didn't hear anything. Tap the microphone and talk again!",
  failed: "The microphone didn't work. You can type instead!",
};
