import type { Level } from "@/lib/types";

export interface Skill {
  id: string;
  level: Level;
  title: string;
  /** What the child should be able to do; injected into the tutor prompt. */
  goal: string;
  /** Concrete target items, practised one at a time. */
  items: readonly string[];
  /** How to practise it with a young child. */
  activity: string;
  /**
   * exact:   the child must say the asked item ("red").
   * pattern: any sentence using the pattern is right ("I like trains" for "I like ___").
   */
  grading: "exact" | "pattern";
  /** For pattern skills: the pattern shown to the tutor/analyzer, and a regex for answers using it. */
  pattern?: { label: string; stem: RegExp };
  /** Feeling words are the expected content here, not a mood report. */
  feelingWords?: boolean;
}

/**
 * L1 = single words (recognise + say), L2 = short patterned phrases,
 * L3 = full sentences (describe, explain, retell).
 */
export const SKILLS: readonly Skill[] = [
  // ── Level 1: first words ───────────────────────────────────────────
  {
    id: "l1-greetings",
    level: 1,
    title: "Greetings & manners",
    goal: "Say simple greetings and polite words.",
    items: ["hello", "goodbye", "please", "thank you", "good morning", "sorry"],
    activity: "Role-play meeting a toy or animal friend; the child says the word.",
    grading: "exact",
  },
  {
    id: "l1-colors",
    level: 1,
    title: "Colors",
    goal: "Name basic colors.",
    items: ["red", "blue", "yellow", "green", "orange", "purple", "pink", "black", "white"],
    activity: "Ask about the color of familiar things (banana, sky, grass), offer two choices.",
    grading: "exact",
  },
  {
    id: "l1-animals",
    level: 1,
    title: "Animals",
    goal: "Name common animals.",
    items: ["cat", "dog", "cow", "duck", "fish", "bird", "lion", "elephant", "monkey"],
    activity: "Animal sound riddles: 'Who says moo?'",
    grading: "exact",
  },
  {
    id: "l1-numbers",
    level: 1,
    title: "Numbers 1–10",
    goal: "Count and name numbers one to ten.",
    items: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"],
    activity: "Count fingers, toes, or pretend apples together.",
    grading: "exact",
  },
  {
    id: "l1-body",
    level: 1,
    title: "Body parts",
    goal: "Name parts of the body.",
    items: ["head", "eyes", "nose", "mouth", "ears", "hands", "feet", "tummy"],
    activity: "Simon-says style: 'Touch your nose! What did you touch?'",
    grading: "exact",
  },
  {
    id: "l1-family",
    level: 1,
    title: "Family",
    goal: "Name family members.",
    items: ["mom", "dad", "baby", "brother", "sister", "grandma", "grandpa"],
    activity: "Talk about a pretend family of animals.",
    grading: "exact",
  },

  // ── Level 2: short phrases ─────────────────────────────────────────
  {
    id: "l2-i-like",
    level: 2,
    title: "I like …",
    goal: "Say what they like with 'I like ___'.",
    items: ["I like apples", "I like dogs", "I like red", "I like to play", "I like ice cream"],
    activity: "Share favourites back and forth; model 'I like ___' and invite them to try.",
    grading: "pattern",
    pattern: { label: "I like ___", stem: /^i like \w/ },
  },
  {
    id: "l2-this-is",
    level: 2,
    title: "This is a …",
    goal: "Name things with 'This is a ___' / 'It is a ___'.",
    items: ["This is a ball", "This is a cat", "It is a car", "It is a tree", "This is a book"],
    activity: "Guessing game with clues; child answers with the full phrase.",
    grading: "exact",
  },
  {
    id: "l2-feelings",
    level: 2,
    title: "Feelings words",
    goal: "Say how they feel with 'I am ___'.",
    items: ["I am happy", "I am sad", "I am tired", "I am excited", "I am angry", "I am scared"],
    activity:
      "Act out faces: 'If you get a present, how do you feel?' If the child seems to really feel that way, acknowledge it kindly.",
    grading: "pattern",
    pattern: { label: "I am ___", stem: /^i am \w/ },
    feelingWords: true,
  },
  {
    id: "l2-actions",
    level: 2,
    title: "Action words",
    goal: "Use action verbs in short phrases ('I can ___').",
    items: ["I can run", "I can jump", "I can swim", "I can sing", "I can clap", "I can dance"],
    activity: "Move-and-say: pretend to jump together, then say 'I can jump'.",
    grading: "pattern",
    pattern: { label: "I can ___", stem: /^i can \w/ },
  },
  {
    id: "l2-what-color",
    level: 2,
    title: "What color is it?",
    goal: "Answer 'What color is it?' with 'It is ___'.",
    items: ["It is red", "It is blue", "It is green", "It is yellow"],
    activity: "Describe imaginary objects; child answers in a phrase.",
    grading: "exact",
  },
  {
    id: "l2-i-want",
    level: 2,
    title: "I want … please",
    goal: "Ask for things politely with 'I want ___, please'.",
    items: ["I want water, please", "I want a banana, please", "I want milk, please", "I want a hug, please"],
    activity: "Pretend café or picnic where the child orders.",
    grading: "pattern",
    pattern: { label: "I want ___, please", stem: /^i want \w/ },
  },

  // ── Level 3: sentences ─────────────────────────────────────────────
  {
    id: "l3-describe",
    level: 3,
    title: "Describing things",
    goal: "Describe with size and color: 'a big red ball'.",
    items: ["a big red ball", "a small brown dog", "a tall green tree", "a little yellow duck"],
    activity: "Mystery object: child describes something, you guess.",
    grading: "pattern",
    pattern: { label: "a/the + size + color + thing", stem: /^((it is|this is) )?(a|an|the|my) (big|small|little|tall|short|long|tiny|huge|fluffy|soft) \w+/ },
  },
  {
    id: "l3-where",
    level: 3,
    title: "Where is it? (in / on / under)",
    goal: "Use in, on, under in a sentence.",
    items: ["The cat is on the bed", "The ball is under the table", "The fish is in the water", "The bird is in the tree"],
    activity: "Hide-and-seek with a pretend toy: 'Where is teddy?'",
    grading: "pattern",
    pattern: { label: "The ___ is in/on/under the ___", stem: /\b(in|on|under|behind|next to) the \w+/ },
  },
  {
    id: "l3-because",
    level: 3,
    title: "Giving reasons (because)",
    goal: "Explain a choice with 'because'.",
    items: ["I like cats because they are soft", "I am happy because I played", "I like summer because it is sunny"],
    activity: "Ask 'why?' about their favourites and help them build the 'because' sentence.",
    grading: "pattern",
    pattern: { label: "___ because ___", stem: /\w+ .*\bbecause \w+/ },
  },
  {
    id: "l3-yesterday",
    level: 3,
    title: "Yesterday (simple past)",
    goal: "Talk about the past with simple past verbs.",
    items: ["I played", "I ate", "I went to the park", "I saw a dog", "I jumped"],
    activity: "Ask what they did yesterday; recast gently ('You goed? Yes, you went!').",
    grading: "pattern",
    pattern: { label: "I + past-tense verb", stem: /^(yesterday )?i (\w+ed|went|ate|saw|ran|swam|had|made|drew|sang|took|got|was|did|rode|fell|found)\b/ },
  },
  {
    id: "l3-questions",
    level: 3,
    title: "Asking questions",
    goal: "Ask simple questions (What, Where, Can I).",
    items: ["What is your name?", "Where is the ball?", "Can I play?", "What color do you like?"],
    activity: "Swap roles: the child asks you questions about an imaginary animal.",
    grading: "pattern",
    pattern: { label: "a simple question (What / Where / Can I …?)", stem: /^(what|where|who|how|can i|can you|do you|is it|are you)\b \w+/ },
  },
  {
    id: "l3-opposites",
    level: 3,
    title: "Opposites",
    goal: "Use opposite words in sentences.",
    items: ["big and small", "hot and cold", "fast and slow", "happy and sad", "up and down"],
    activity: "Opposite game: 'An elephant is big, a mouse is…?'",
    grading: "exact",
  },
];

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function getSkill(id: string): Skill {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) throw new Error(`Unknown skill: ${id}`);
  return skill;
}

export function skillsForLevel(level: Level): Skill[] {
  return SKILLS.filter((skill) => skill.level === level);
}

/** Per-level guidance for how hard the tutor's language should be. */
export const LEVEL_GUIDE: Record<Level, { label: string; style: string; maxWords: number }> = {
  1: {
    label: "first words",
    style:
      "Use very short sentences (3–6 words). Ask for a single word. Offer two choices ('Is it red or blue?'). Repeat the target word.",
    maxWords: 25,
  },
  2: {
    label: "short phrases",
    style:
      "Use short simple sentences. Model the phrase pattern first, then invite the child to say it. Accept single words and gently expand them into the phrase.",
    maxWords: 35,
  },
  3: {
    label: "sentences",
    style:
      "Use simple full sentences. Ask open questions (what, where, why). Encourage full-sentence answers and recast mistakes naturally.",
    maxWords: 45,
  },
};
