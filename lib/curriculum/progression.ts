import { getSkill, skillsForLevel } from "@/lib/curriculum/curriculum";
import type {
  AnswerResult,
  ChildProfile,
  Difficulty,
  Level,
  SkillProgress,
} from "@/lib/types";

/** EMA weight of the newest answer. */
const MASTERY_ALPHA = 0.3;
export const SKILL_MASTERY_THRESHOLD = 0.8;
export const SKILL_MIN_ATTEMPTS = 4;
/** Share of a level's skills that must be mastered to move up. */
export const LEVEL_UP_RATIO = 0.8;
/** Rotate to another skill after this many attempts in a row, for variety. */
const SKILL_ROTATION_ATTEMPTS = 6;
const RECENT_WINDOW = 6;
const ITEM_MASTERED_CORRECT = 2;

const SCORE: Record<AnswerResult, number> = { correct: 1, partial: 0.5, incorrect: 0 };

export function emptySkillProgress(): SkillProgress {
  return {
    attempts: 0,
    correct: 0,
    mastery: 0,
    items: {},
    lastPracticedTurn: -1,
    streakAttempts: 0,
  };
}

function progressFor(profile: ChildProfile, skillId: string): SkillProgress {
  return profile.skills[skillId] ?? emptySkillProgress();
}

export function isSkillMastered(progress: SkillProgress | undefined): boolean {
  return (
    !!progress &&
    progress.attempts >= SKILL_MIN_ATTEMPTS &&
    progress.mastery >= SKILL_MASTERY_THRESHOLD
  );
}

export function firstSkillForLevel(level: Level): string {
  return skillsForLevel(level)[0].id;
}

/**
 * Pick the next skill within the child's level: least mastered first, then
 * least recently practised. Avoids `excludeId` when there is an alternative.
 */
export function pickNextSkill(profile: ChildProfile, excludeId?: string): string {
  const candidates = skillsForLevel(profile.level);
  const unmastered = candidates.filter((s) => !isSkillMastered(profile.skills[s.id]));
  const pool = unmastered.length > 0 ? unmastered : candidates;
  const filtered = pool.length > 1 ? pool.filter((s) => s.id !== excludeId) : pool;

  return [...filtered].sort((a, b) => {
    const pa = progressFor(profile, a.id);
    const pb = progressFor(profile, b.id);
    return pa.mastery - pb.mastery || pa.lastPracticedTurn - pb.lastPracticedTurn;
  })[0].id;
}

/**
 * The item the tutor should practise next: an item not yet mastered with the
 * fewest attempts, skipping the item that was just practised when possible.
 */
export function pickTargetItem(profile: ChildProfile, lastItem?: string | null): string {
  const skill = getSkill(profile.currentSkillId);
  const progress = progressFor(profile, skill.id);
  const notMastered = skill.items.filter(
    (item) => (progress.items[item]?.correct ?? 0) < ITEM_MASTERED_CORRECT,
  );
  const pool = notMastered.length > 0 ? notMastered : [...skill.items];
  const filtered = pool.length > 1 ? pool.filter((item) => item !== lastItem) : pool;

  return [...filtered].sort(
    (a, b) => (progress.items[a]?.attempts ?? 0) - (progress.items[b]?.attempts ?? 0),
  )[0];
}

/**
 * When the child is struggling we scaffold (choices, modelling) instead of
 * dropping their level — demotion would hurt confidence.
 */
export function currentDifficulty(profile: ChildProfile): Difficulty {
  if (profile.incorrectStreak >= 2) return "easier";
  const recent = profile.recentScores.slice(-RECENT_WINDOW);
  if (recent.length >= 3) {
    const avg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
    if (avg < 0.4) return "easier";
  }
  return "normal";
}

export interface ProgressUpdate {
  levelUp: Level | null;
  skillMastered: string | null;
  skillChanged: boolean;
}

/** Applies one assessed answer to the profile (mutates it) and returns what changed. */
export function recordAnswer(
  profile: ChildProfile,
  skillId: string,
  item: string | null,
  result: AnswerResult,
): ProgressUpdate {
  const score = SCORE[result];
  const progress = { ...progressFor(profile, skillId) };
  const wasMastered = isSkillMastered(progress);

  progress.attempts += 1;
  if (result === "correct") progress.correct += 1;
  progress.mastery = progress.mastery + MASTERY_ALPHA * (score - progress.mastery);
  progress.lastPracticedTurn = profile.totalTurns;
  progress.streakAttempts += 1;
  if (item) {
    const stats = progress.items[item] ?? { attempts: 0, correct: 0 };
    progress.items = {
      ...progress.items,
      [item]: {
        attempts: stats.attempts + 1,
        correct: stats.correct + (result === "correct" ? 1 : 0),
      },
    };
  }
  profile.skills = { ...profile.skills, [skillId]: progress };

  profile.recentScores = [...profile.recentScores, score].slice(-RECENT_WINDOW * 2);
  profile.incorrectStreak = result === "incorrect" ? profile.incorrectStreak + 1 : 0;

  const skillMastered = !wasMastered && isSkillMastered(progress) ? skillId : null;

  const levelUp = maybeLevelUp(profile);
  let skillChanged = levelUp !== null;

  if (!levelUp && skillId === profile.currentSkillId) {
    if (skillMastered || progress.streakAttempts >= SKILL_ROTATION_ATTEMPTS) {
      const next = pickNextSkill(profile, skillId);
      if (next !== skillId) {
        switchSkill(profile, next);
        skillChanged = true;
      } else {
        progress.streakAttempts = 0;
      }
    }
  }

  return { levelUp, skillMastered, skillChanged };
}

function switchSkill(profile: ChildProfile, skillId: string) {
  const progress = progressFor(profile, skillId);
  profile.currentSkillId = skillId;
  profile.skills = { ...profile.skills, [skillId]: { ...progress, streakAttempts: 0 } };
}

export function levelMasteryRatio(profile: ChildProfile, level: Level): number {
  const skills = skillsForLevel(level);
  const mastered = skills.filter((s) => isSkillMastered(profile.skills[s.id])).length;
  return mastered / skills.length;
}

function maybeLevelUp(profile: ChildProfile): Level | null {
  if (profile.level >= 3) return null;
  if (levelMasteryRatio(profile, profile.level) < LEVEL_UP_RATIO) return null;

  const next = (profile.level + 1) as Level;
  profile.level = next;
  profile.recentScores = [];
  profile.incorrectStreak = 0;
  profile.pendingCelebration = next;
  switchSkill(profile, firstSkillForLevel(next));
  return next;
}

/** Compact progress summary for API responses / parent dashboards. */
export function progressSummary(profile: ChildProfile) {
  return {
    level: profile.level,
    currentSkill: getSkill(profile.currentSkillId).title,
    levelMastery: Math.round(levelMasteryRatio(profile, profile.level) * 100) / 100,
    skills: skillsForLevel(profile.level).map((skill) => {
      const p = profile.skills[skill.id];
      return {
        id: skill.id,
        title: skill.title,
        attempts: p?.attempts ?? 0,
        mastery: Math.round((p?.mastery ?? 0) * 100) / 100,
        mastered: isSkillMastered(p),
      };
    }),
  };
}
