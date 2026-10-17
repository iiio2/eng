import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { pickVoice, toSpeakable } from "@/lib/client/speech";

const noopSubscribe = () => () => {};
const isSupported = () => "speechSynthesis" in window;

// iOS/iPadOS WebKit ignores speak() until one call happens during a user gesture.
let unlocked = false;

/** Reads text aloud with a child-friendly voice. Utterances queue in order. */
export function useSpeechSynthesis(enabled: boolean) {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, () => false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    // Voices load asynchronously in most browsers.
    const choose = () => (voiceRef.current = pickVoice(synth.getVoices()));
    choose();
    synth.addEventListener("voiceschanged", choose);
    return () => {
      synth.removeEventListener("voiceschanged", choose);
      synth.cancel();
    };
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  /**
   * Call synchronously inside every tap that can lead to speech. The first call
   * speaks a silent utterance, which lifts iOS's user-gesture restriction for
   * the rest of the page's life (later replies are spoken from network callbacks).
   */
  const unlock = useCallback(() => {
    if (!supported || unlocked) return;
    unlocked = true;
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      const spoken = toSpeakable(text);
      if (!supported || !enabled || !spoken) return;
      const utterance = new SpeechSynthesisUtterance(spoken);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.lang = voiceRef.current?.lang ?? "en-US";
      utterance.rate = 0.9; // a little slower for young listeners
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    },
    [supported, enabled],
  );

  /** "Hear it again": stop whatever is playing, then speak. */
  const replay = useCallback(
    (text: string) => {
      if (!supported) return;
      unlock();
      const synth = window.speechSynthesis;
      if (!synth.speaking && !synth.pending) return speak(text);
      // Chrome and Safari can drop a speak() issued in the same task as cancel().
      synth.cancel();
      setTimeout(() => speak(text), 60);
    },
    [supported, unlock, speak],
  );

  // Turning sound off stops anything already playing.
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  return { supported, speak, replay, cancel, unlock };
}
