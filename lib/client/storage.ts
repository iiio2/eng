import type { Level, Mode } from "@/lib/types";

/**
 * Device-local persistence. Every access is guarded: storage can be missing
 * or throw (private mode, blocked site data), and the app must still work.
 */
export interface Session {
  childId: string;
  name: string | null;
  chatToken: string;
  parentToken: string;
}

export interface StoredMessage {
  id: string;
  role: "child" | "assistant";
  text: string;
  mode?: Mode;
}

/** Per-child chat state; stored with its childId so it never leaks to another profile. */
export interface ChatState {
  messages: StoredMessage[];
  /** Last level the client saw, to notice level-ups the server reports late. */
  level: Level | null;
}

export interface Prefs {
  sound: boolean;
}

export const SESSION_KEY = "english-buddy:session";
const CHAT_KEY = "english-buddy:chat";
const PREFS_KEY = "english-buddy:prefs";

const MAX_STORED_MESSAGES = 40;

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; the current tab keeps working.
  }
}

export function loadSession(): Session | null {
  const session = read<Session>(SESSION_KEY);
  return session?.childId && session.chatToken && session.parentToken ? session : null;
}

export const saveSession = (session: Session) => write(SESSION_KEY, session);

/**
 * Forget a child on this device (session and chat). Compare-and-delete: a
 * stale tab can't wipe a different child that was set up since.
 */
export function clearSession(childId: string) {
  if (loadSession()?.childId === childId) write(SESSION_KEY, null);
  if (read<{ childId?: string }>(CHAT_KEY)?.childId === childId) write(CHAT_KEY, null);
}

export function loadChatState(childId: string): ChatState {
  const stored = read<{ childId?: string } & Partial<ChatState>>(CHAT_KEY);
  if (stored?.childId !== childId || !Array.isArray(stored.messages)) return { messages: [], level: null };
  return { messages: stored.messages, level: stored.level ?? null };
}

export function saveChatState(childId: string, state: ChatState) {
  write(CHAT_KEY, { childId, level: state.level, messages: state.messages.slice(-MAX_STORED_MESSAGES) });
}

export const loadPrefs = (): Prefs => ({ sound: true, ...read<Partial<Prefs>>(PREFS_KEY) });

export const savePrefs = (prefs: Prefs) => write(PREFS_KEY, prefs);
