import { useEffect, useState } from "react";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { clearSession, loadSession, saveSession, SESSION_KEY, type Session } from "@/lib/client/storage";

const SESSION_LOST =
  "Pip couldn't find this profile any more (the server may have restarted). Please set it up again.";

/** Client-only root: shows setup until this device has a child profile, then the chat. */
export default function ChildApp() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [notice, setNotice] = useState<string | null>(null);

  // Another tab deleted or replaced the profile: follow it instead of chatting with a stale one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY || event.key === null) setSession(loadSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!session) {
    return (
      <SetupScreen
        notice={notice}
        onCreated={(created) => {
          saveSession(created);
          setNotice(null);
          setSession(created);
        }}
      />
    );
  }

  return (
    <ChatScreen
      key={session.childId}
      session={session}
      onSessionLost={() => {
        clearSession(session.childId);
        setNotice(SESSION_LOST);
        setSession(loadSession());
      }}
    />
  );
}
