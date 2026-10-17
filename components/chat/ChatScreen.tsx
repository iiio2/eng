import { useEffect, useRef, useState } from "react";
import { Celebration } from "@/components/chat/Celebration";
import { ChatHeader, STATUS_TEXT } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { MIC_ERROR_TEXT, PROBLEM_TEXT } from "@/components/chat/copy";
import { MessageList } from "@/components/chat/MessageList";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { MOOD_FOR_MODE, type PipMood } from "@/components/Pip";
import { useChat } from "@/hooks/useChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { SentenceChunker } from "@/lib/client/speech";
import { loadPrefs, savePrefs, type Session } from "@/lib/client/storage";

interface ChatScreenProps {
  session: Session;
  onSessionLost: () => void;
}

export function ChatScreen({ session, onSessionLost }: ChatScreenProps) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const tts = useSpeechSynthesis(prefs.sound);
  const { speak } = tts;
  const chunkerRef = useRef(new SentenceChunker());
  const logRef = useRef<HTMLDivElement>(null);

  const chat = useChat(session, {
    // Every turn (send or retry) starts with a quiet Pip and an empty sentence buffer.
    onTurnStart: () => {
      tts.cancel();
      chunkerRef.current = new SentenceChunker();
    },
    // Speak each sentence as soon as it is complete, while the rest streams in.
    onReplyToken: (token) => chunkerRef.current.push(token).forEach(speak),
    onReplyDone: () => {
      const rest = chunkerRef.current.flush();
      if (rest) speak(rest);
    },
    onSessionLost,
  });

  const mic = useSpeechRecognition((text) => void chat.send(text));

  // Taps run these synchronously, so unlock() happens inside the user gesture (iOS).
  const sendFromTap = (text: string) => {
    tts.unlock();
    mic.abort(); // a half-finished recording must not arrive later and interrupt this turn
    void chat.send(text);
  };
  const startListening = () => {
    tts.unlock();
    tts.cancel(); // don't let Pip's voice talk over (or into) the microphone
    mic.start();
  };
  const retry = () => {
    tts.unlock();
    logRef.current?.focus(); // the Try again button is about to disappear
    chat.retry();
  };

  // Children who can't read hear problems from Pip, not just see them.
  const problemId = chat.problem?.id;
  const problemKind = chat.problem?.kind;
  useEffect(() => {
    if (problemKind) speak(PROBLEM_TEXT[problemKind]);
  }, [problemId, problemKind, speak]);
  useEffect(() => {
    if (mic.error) speak(MIC_ERROR_TEXT[mic.error]);
  }, [mic.error, speak]);

  const { levelUp } = chat;
  useEffect(() => {
    if (levelUp) speak("Hooray! You learned so many words!");
  }, [levelUp, speak]);

  const waitingForFirstWord = chat.busy && !chat.messages.at(-1)?.text;
  const modeMood: PipMood = chat.mode ? MOOD_FOR_MODE[chat.mode] : "happy";
  const mood: PipMood = mic.listening ? "listening" : waitingForFirstWord ? "thinking" : modeMood;
  const blocked = chat.busy || chat.paused;

  const greeting = `Hi${session.name ? ` ${session.name}` : ""}! I'm Pip. ${
    mic.supported ? "Tap the microphone and say hello!" : "Type hello to start!"
  }`;

  const toggleSound = () => {
    const next = { ...prefs, sound: !prefs.sound };
    if (next.sound) tts.unlock();
    setPrefs(next);
    savePrefs(next);
  };

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        mood={mood}
        modeAnnouncement={chat.mode ? STATUS_TEXT[modeMood] : ""}
        sound={{ supported: tts.supported, on: prefs.sound, toggle: toggleSound }}
      />
      <MessageList
        ref={logRef}
        messages={chat.messages}
        greeting={greeting}
        interim={mic.interim}
        problem={chat.problem}
        onRetry={retry}
        onReplay={tts.supported && prefs.sound ? tts.replay : undefined}
      />
      <footer className="border-t border-line bg-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <QuickReplies disabled={blocked} onSend={sendFromTap} />
          <Composer disabled={blocked} mic={{ ...mic, start: startListening }} onSend={sendFromTap} />
        </div>
      </footer>
      {levelUp && <Celebration onClose={chat.dismissLevelUp} />}
    </div>
  );
}
