import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal typing: the Web Speech recognition API is not in TypeScript's DOM lib everywhere.
interface RecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};
const isSupported = () => getCtor() !== null;

export type MicError = "denied" | "no-speech" | "failed";

function detach(recognition: Recognition) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
}

/** Push-to-talk speech input: one utterance per start(), final text via onFinal. */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false);
  const recognitionRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<MicError | null>(null);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  /** Finish listening and send what was heard. */
  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  /** Stop listening and throw away what was heard (e.g. the child tapped a button instead). */
  const abort = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    detach(recognition);
    recognition.abort();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || recognitionRef.current) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalText = "";
    let heard = "";
    let failed = false;
    recognition.onresult = (event) => {
      // Rebuild from the full list each time: no duplicated finals, no lost words.
      let finals = "";
      let live = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else live += result[0].transcript;
      }
      finalText = finals.trim();
      heard = `${finals}${live}`.trim();
      setInterim(heard);
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      failed = true;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "denied"
          : event.error === "no-speech"
            ? "no-speech"
            : "failed",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      // Safari can end (e.g. on stop) before finalising: send what was heard.
      const text = finalText || heard;
      if (text) onFinalRef.current(text);
      else if (!failed) setError("no-speech");
    };

    recognitionRef.current = recognition;
    setError(null);
    setInterim("");
    setListening(true);
    try {
      recognition.start();
    } catch {
      detach(recognition);
      recognitionRef.current = null;
      setListening(false);
      setError("failed");
    }
  }, []);

  // Leaving the screen must not send anything from it.
  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        detach(recognition);
        recognition.abort();
      }
    },
    [],
  );

  return { supported, listening, interim, error, start, stop, abort };
}
