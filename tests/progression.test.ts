import { describe, expect, it } from "vitest";
import { SKILLS, getSkill, skillsForLevel } from "@/lib/curriculum/curriculum";
import {
  currentDifficulty,
  isSkillMastered,
  pickTargetItem,
  recordAnswer,
} from "@/lib/curriculum/progression";
import { LEVELS } from "@/lib/types";
import { makeProfile } from "./helpers";

describe("curriculum", () => {
  it("has unique skill ids and skills for every level", () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const level of LEVELS) expect(skillsForLevel(level).length).toBeGreaterThan(0);
  });
});

describe("recordAnswer", () => {
  it("raises mastery on correct answers and masters a skill", () => {
    const profile = makeProfile();
    const skillId = profile.currentSkillId;
    for (let i = 0; i < 6; i++) recordAnswer(profile, skillId, "hello", "correct");
    expect(isSkillMastered(profile.skills[skillId])).toBe(true);
    expect(profile.skills[skillId].items.hello).toEqual({ attempts: 6, correct: 6 });
  });

  it("moves to another skill once the current one is mastered", () => {
    const profile = makeProfile();
    const first = profile.currentSkillId;
    let changed = false;
    for (let i = 0; i < 6 && !changed; i++) {
      changed = recordAnswer(profile, first, null, "correct").skillChanged;
    }
    expect(changed).toBe(true);
    expect(profile.currentSkillId).not.toBe(first);
    expect(getSkill(profile.currentSkillId).level).toBe(1);
  });

  it("levels up when most skills of the level are mastered", () => {
    const profile = makeProfile();
    let levelUp = null;
    for (const skill of skillsForLevel(1)) {
      for (let i = 0; i < 8 && !levelUp; i++) {
        levelUp = recordAnswer(profile, skill.id, null, "correct").levelUp;
      }
    }
    expect(levelUp).toBe(2);
    expect(profile.level).toBe(2);
    expect(profile.pendingCelebration).toBe(2);
    expect(getSkill(profile.currentSkillId).level).toBe(2);
  });

  it("never levels past 3", () => {
    const profile = makeProfile({ level: 3, currentSkillId: skillsForLevel(3)[0].id });
    for (const skill of skillsForLevel(3)) {
      for (let i = 0; i < 8; i++) expect(recordAnswer(profile, skill.id, null, "correct").levelUp).toBeNull();
    }
    expect(profile.level).toBe(3);
  });

  it("scaffolds (easier) after mistakes instead of demoting", () => {
    const profile = makeProfile({ level: 2, currentSkillId: skillsForLevel(2)[0].id });
    recordAnswer(profile, profile.currentSkillId, null, "incorrect");
    recordAnswer(profile, profile.currentSkillId, null, "incorrect");
    expect(currentDifficulty(profile)).toBe("easier");
    expect(profile.level).toBe(2);

    recordAnswer(profile, profile.currentSkillId, null, "correct");
    expect(profile.incorrectStreak).toBe(0);
  });
});

describe("pickTargetItem", () => {
  it("rotates away from the item just practised and skips mastered items", () => {
    const profile = makeProfile();
    const items = getSkill(profile.currentSkillId).items;
    expect(pickTargetItem(profile, items[0])).not.toBe(items[0]);

    profile.skills[profile.currentSkillId] = {
      attempts: 2,
      correct: 2,
      mastery: 0.5,
      items: { [items[1]]: { attempts: 2, correct: 2 } },
      lastPracticedTurn: 0,
      streakAttempts: 2,
    };
    expect(pickTargetItem(profile, items[0])).not.toBe(items[1]);
  });
});
