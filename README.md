# English Buddy — AI English learning chatbot for children (under 7)

Next.js (Pages Router) + LangChain.js backend for a child-safe English tutor that
teaches progressively (L1 → L3), detects the child's mode and mood, supports
social-emotional learning, and replies in under 2 seconds.

## Getting started

```bash
cp .env.example .env   # add your OPENAI_API_KEY
pnpm install
pnpm dev               # http://localhost:3000
pnpm test              # unit + engine tests (no network needed)
pnpm typecheck && pnpm lint
```

## Frontend

| Screen | Who it's for | What it does |
| --- | --- | --- |
| `/` setup | Parent | Collects a first name, age and starting level, then creates the profile |
| `/` chat | Child | Voice-first chat with Pip ([components/chat/](components/chat/)) |
| `/parent` | Parent | A "grown-ups only" question, then progress, moods, interests, safety alerts, the transcript and deletion ([components/parent/](components/parent/)) |

How the chat works for a child under 7:
- **Voice first.** Pip reads replies aloud sentence by sentence while they stream ([lib/client/speech.ts](lib/client/speech.ts)). A big mic button sends speech without typing; it uses the Web Speech API, so Chrome, Edge and Safari support it. Typing is the fallback everywhere else.
  - iOS only allows speech after a tap, so every tap that can lead to speech first speaks a silent utterance ([hooks/useSpeechSynthesis.ts](hooks/useSpeechSynthesis.ts)).
  - Tapping a button while the mic is recording discards the recording, so it can't interrupt the next reply.
  - Errors are spoken as well as shown.
- **Mood visuals.** Pip's expression and the header status follow the mode, so the child doesn't need to read them: graduation cap for learning, sparkles for play, a heart for feelings, dots while thinking, sound waves while listening.
- **One-tap buttons.** Feeling faces (each with a text label) and quick buttons: play, learn, story.
- **Celebration.** Leveling up shows a celebration with confetti; it respects reduced-motion settings. The client compares levels, so a level-up the server reports late (`analysisPending`) is still celebrated on the next turn.
- **Friendly errors.** Problems show a kind message with "Try again"; after a rate limit, sending pauses until `Retry-After` has passed. If the connection drops mid-reply, the partial reply is kept and nothing is re-sent, because the server already saved that turn. Only the app's own `child_not_found` or `unauthorized` errors send the parent back to setup; a 401/404 page from a proxy or CDN doesn't.

Both pages load client-only because the session lives in `localStorage` ([lib/client/storage.ts](lib/client/storage.ts)). The tokens are stored on the device, along with the last 40 messages, which are tied to the child's id so they never show up for another profile. Other tabs follow profile changes through `storage` events. Every storage access is guarded, so private mode still works.

The parent corner sits behind a two-digit × one-digit question. After two wrong answers there's a wait that doubles each time (from 30 s up to 5 min) and survives a reload. Deleting a profile also requires typing "delete". This suits a family tablet.

## How a turn works

```
child message
   │
   ├─ 1. rule-based signals (~0 ms) ── mood, safety, boredom, sharing, requests
   ├─ 2. mode policy (deterministic) ─ learning | conversation | engagement | support
   ├─ 3. in parallel:
   │     ├─ tutor LLM (streamed to the client)       ← the child sees this
   │     └─ analyzer LLM (structured output)         ← mood, engagement, answer grading
   └─ 4. progress + memory update, persisted; `done` event sent
```

The analyzer is **never on the critical path**: the reply is driven by fast
signals plus the stored profile, and the analyzer's findings shape the *next*
turn. `done` is sent within ~1.8 s; if the analyzer is later than that, its
results are still applied and saved (`analysisPending: true`).

**Grading** ([lib/engine/answers.ts](lib/engine/answers.ts)) checks deterministically first:
- **Exact skills** (L1 words, and a few L2/L3 skills): the asked item is correct; another item from the skill is not.
- **Pattern skills** (e.g. "I like ___", "I can ___", "because"): any sentence using the pattern is correct.

The analyzer only decides what the code can't, such as misspellings and free answers. The
next item is chosen *after* this check. The child is graded against the item the reply
actually asked for, and game answers only count when they're right.

| Concern | Where |
| --- | --- |
| Curriculum (L1 words → L2 phrases → L3 sentences) | [lib/curriculum/curriculum.ts](lib/curriculum/curriculum.ts) |
| Mastery, skill rotation, level-up, scaffolding | [lib/curriculum/progression.ts](lib/curriculum/progression.ts) |
| Fast mood/safety/intent signals | [lib/detection/signals.ts](lib/detection/signals.ts) |
| Mode policy (when *not* to teach) | [lib/detection/mode.ts](lib/detection/mode.ts) |
| Prompts (persona, safety, SEL, per-mode) | [lib/llm/prompts.ts](lib/llm/prompts.ts) |
| Answer checks, practice-answer detection | [lib/engine/answers.ts](lib/engine/answers.ts) |
| Turn orchestration, deadlines | [lib/engine/turn.ts](lib/engine/turn.ts) |
| Capability tokens | [lib/auth.ts](lib/auth.ts) |
| Storage interface (in-memory today) | [lib/memory/store.ts](lib/memory/store.ts) |

### Modes

- **learning**: practises one curriculum item, reacts to the answer, scaffolds when the child struggles.
- **conversation**: follows the child's lead with no quizzing. Used at session start (feelings check-in), when the child shares something, after 4 learning turns in a row, and for goodbyes.
- **engagement**: a short game when the child is bored, refuses or asks to play. It's also used once, as an easy-win break, after 3 misses in a row during practice.
- **support**: SEL comfort when the child shows negative feelings. Safety concerns (someone hurting or touching them, being lost, secrets with grown-ups, self-harm) are flagged for parents, and the reply encourages telling a trusted grown-up. If only the analyzer notices a concern, the next reply checks in.

A short practice answer is not treated as a mood report. For example, "I'm sad" in the feelings skill is an answer. But distress that merely *contains* the target word ("I'm scared, I want my mom") still goes to support.

### Progression

Each skill tracks mastery as a moving average of answer scores. A skill is
mastered at ≥ 0.8 mastery after ≥ 4 attempts. The child moves up a level once
80% of the level's skills are mastered, and the next reply celebrates. A child
who is struggling gets easier prompts (choices, modelling) but never drops a level.

## API

**Auth.** There are no parent accounts yet. Creating a profile returns two bearer tokens, shown once and stored only as hashes:
- `chatToken` goes on the child's device. It can only chat.
- `parentToken` unlocks the parent view and deletion. It can also chat.

Send them as `Authorization: Bearer <token>`.

### `POST /api/children`

Create a profile. Body (all optional): `{ "name": "Mia", "age": 5, "level": 1 }`.
Returns `201` with the profile view plus `childId`, `chatToken` and `parentToken`. Rate-limited per IP.

### `POST /api/chat` (chat or parent token)

Body: `{ "childId": "…", "message": "hello", "stream": true }`

With `stream: true` (the default), the response is `text/event-stream`:

| event | data |
| --- | --- |
| `start` | `{ mode, reason, level }`, sent as soon as the mode is chosen |
| `token` | `{ text }`, a chunk of the reply |
| `done` | `{ reply, mode, reason, level, levelUp, mood, assessment, safetyConcern, degraded, interrupted, analysisPending, timing }` |
| `error` | `{ code, message }` |

With `stream: false`, the response is one JSON object shaped like `done`.

Errors: `400 invalid_request`, `401 unauthorized`, `404 child_not_found`, `429 rate_limited`.

### `GET /api/children/:childId` (parent token)

Parent view: level, per-skill mastery, mood history, interests, safety flags and recent history.

### `DELETE /api/children/:childId` (parent token)

Deletes the profile and all its data. It waits for any in-flight turn, so the deletion sticks.

## Latency

Measured on a production build (`pnpm build && pnpm start`), with 3–6 s gaps between messages.
Warm turns: time to first token ≈ 0.7–1.3 s, `done` ≈ 0.9–1.8 s. The first request after a
cold start can take longer (2.3 s was seen once).

Levers, in [lib/config.ts](lib/config.ts): non-reasoning models, a 120-token reply cap, a
compact prompt, a reused HTTP client, and an analyzer that runs in parallel.

Guards when OpenAI is slow:
- No first token within 2.5 s → a friendly fallback reply.
- A stalled stream (2 s with no tokens) → the reply is cut off.
- The tutor never retries, because a retry can't fit the latency budget.

## Before production

- **Persistence**: replace `InMemoryChildStore` with Redis/Postgres. It's capped at `MAX_PROFILES` and keeps no data across restarts. The per-child lock and the rate limiters are also in-memory, so they work on a single instance only.
- **Proxies**: behind a load balancer, set `TRUST_PROXY_HOPS` so rate limits use the real client IP. With the default of 0, `X-Forwarded-For` is ignored.
- **Accounts**: replace the capability tokens with parent accounts and add token rotation.
- **Moderation**: consider an output moderation pass and alerting parents on `safetyFlags`.
