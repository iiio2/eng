import type { Mood } from "@/lib/types";

/**
 * Fast, synchronous signals from the child's message. These steer the mode
 * for the *current* reply without an extra LLM round-trip; the LLM analyzer
 * runs in parallel and refines the child's state for later turns.
 */
export interface Signals {
  mood: Mood | null;
  /** Possible harm to the child (someone hurting them, lost, secrets). */
  safetyConcern: boolean;
  /** Physical hurt like "my tummy hurts" — comfort, not a safety escalation. */
  hurt: boolean;
  disengaged: boolean;
  wantsPlay: boolean;
  wantsLearn: boolean;
  /** Child-initiated sharing ("guess what", "my dog…"). */
  sharing: boolean;
  /** Child-initiated curiosity question. */
  asksQuestion: boolean;
  farewell: boolean;
  wordCount: number;
}

/** Lower-case, strip elongations ("sooo saaad" → "so sad"), normalise apostrophes. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/([a-z])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Someone doing something to the child. "push me on the swing" is play, not harm.
const HARM_VERBS =
  "hit|hits|hitting|hurt|hurts|hurting|kick|kicks|kicked|punch|punches|punched|bite|bites|bit|slap|slaps|slapped|smack|smacks|smacked|spank|spanks|spanked|beat|beats|choke|chokes|choked|grab|grabs|grabbed|pinch|pinches|pinched|scratch|scratched|shake|shook";

const SAFETY = [
  new RegExp(`\\b(${HARM_VERBS}) me\\b`),
  /\bpush(es|ed)? me\b(?! (on|in|higher|high|around|back and forth))/,
  // "my brother hurt my arm" — but not "I hurt my knee" / "it hurt my tummy".
  new RegExp(`\\b(?!(?:i|it|that|this)\\b)\\w+ (${HARM_VERBS}) my \\w+`),
  /\btouch(es|ed|ing)? (me )?(on )?(my )?(private|privates|pee ?pee|wee ?wee|bottom|butt|down there|body|willy|vagina|penis)\b/,
  /\bbull(y|ies|ied|ying)\b/,
  /\bstranger\b/,
  /\b(get|got|come|go) in(to)? (his|her|their|a|the) (car|van|truck)\b/,
  /\bi('?m| am| got) lost\b/,
  /\b(can'?t find|lost) (my )?(mom|mommy|mum|mummy|dad|daddy|mama|papa)\b/,
  /\b(hurt|kill|cut) myself\b/,
  /\b(want to|wanna|going to|gonna) die\b/,
  /\bi wish i (was|were) dead\b|\bi want to be dead\b/,
  /\bkill(s|ed)? (me|myself|us)\b|\b(going to|gonna|will|wants to) kill\b/,
  /\bour (little )?secret\b|\bsecret (with|from) (a |my )?(grown ?up|uncle|man|lady|adult|teacher|mom|mommy|dad|daddy)\b/,
  /\b(said|says|told me) (to )?(don'?t|not to|never) tell\b/,
  /\bdon'?t tell (my )?(mom|mommy|mum|dad|daddy|anyone|anybody|grown ?ups?)\b/,
  /\bnobody (loves|likes) me\b/,
];

const HURT = [/\bmy \w+ (hurts?|is hurting)\b/, /\bi('?m| am) hurt\b/, /\b(ouch|owie)\b/, /\bi fell\b/, /\bi('?m| am) sick\b/];

// Order matters: the first matching mood wins, so stronger states come first.
const MOOD_PATTERNS: [Mood, RegExp][] = [
  ["scared", /\b(scared|scary|afraid|frightened|nightmare|i'?m fear)\b|😨|😱|😰/],
  ["sad", /\b(sad|cry|crying|cried|upset|unhappy|lonely|miss my|missing my)\b|😢|😭|☹️|🙁/],
  ["angry", /\b(angry|mad|hate|furious|grr)\b|😠|😡/],
  ["frustrated", /\b(too hard|so hard|it'?s hard|this is hard|i can'?t do|i give up|i'?m stupid|i'?m bad at)\b/],
  ["tired", /\b(tired|sleepy|yawn|exhausted)\b|😴|🥱/],
  ["bored", /\b(bored|boring)\b|😐/],
  ["excited", /\b(excited|yippee|hooray|hurray|can'?t wait|wow)\b|🎉|🤩/],
  ["happy", /\b(happy|yay|fun|love|awesome|great|good day)\b|😀|😃|😄|😊|🙂|❤️/],
];

const DISENGAGED = [
  /\b(don'?t|dont|do not) (want|wanna|like)\b/,
  /\bno more\b/,
  /\b(stop|go away|leave me alone|not again)\b/,
  /^(no+|nope|nah|meh|ugh)[.!]*$/,
];

const WANTS_PLAY = /\b(play|game|story|stories|sing|song|joke|riddle|pretend)\b/;
const WANTS_LEARN = /\b(learn|teach me|quiz|ask me|more words|new word|practice|lesson)\b/;
const SHARING = /\b(guess what|you know what|look|today i|yesterday i|i love|i like|i have a|my (mom|mommy|mum|dad|daddy|brother|sister|friend|dog|cat|puppy|kitty|grandma|grandpa|teacher|toy|birthday|house))\b/;
const QUESTION_START = /^(why|what|where|who|how|when|can you|do you|are you|did you|is it|will you)\b/;
const FAREWELL = /\b(i have to go|i gotta go|gotta go|good ?night|see you( later| tomorrow)?|i'?m going to (bed|sleep)|bye bye)\b/;

export function detectSignals(message: string): Signals {
  const text = normalize(message);
  const wordCount = text.split(" ").filter(Boolean).length;
  const mood = MOOD_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  const hurt = HURT.some((p) => p.test(text));

  return {
    mood: mood ?? (hurt ? "sad" : null),
    safetyConcern: SAFETY.some((p) => p.test(text)),
    hurt,
    disengaged: DISENGAGED.some((p) => p.test(text)),
    wantsPlay: WANTS_PLAY.test(text),
    wantsLearn: WANTS_LEARN.test(text),
    sharing: SHARING.test(text),
    asksQuestion: wordCount >= 3 && (text.endsWith("?") || QUESTION_START.test(text)),
    farewell: FAREWELL.test(text),
    wordCount,
  };
}
