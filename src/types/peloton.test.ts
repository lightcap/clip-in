import { describe, it, expect } from "vitest";
import { MUSCLE_GROUPS, type MuscleGroup } from "./peloton";

describe("MUSCLE_GROUPS constant", () => {
  it("should contain expected muscle groups", () => {
    const groupIds = MUSCLE_GROUPS.map((g) => g.id);

    expect(groupIds).toContain("arms");
    expect(groupIds).toContain("back");
    expect(groupIds).toContain("chest");
    expect(groupIds).toContain("core");
    expect(groupIds).toContain("glutes");
    expect(groupIds).toContain("legs");
    expect(groupIds).toContain("shoulders");
    expect(groupIds).toContain("full_body");
  });

  it("should have 8 muscle groups", () => {
    expect(MUSCLE_GROUPS).toHaveLength(8);
  });

  it("should have labels for all groups", () => {
    MUSCLE_GROUPS.forEach((group) => {
      expect(group.label).toBeDefined();
      expect(typeof group.label).toBe("string");
      expect(group.label.length).toBeGreaterThan(0);
    });
  });

  it("should have subgroups array (even if empty)", () => {
    MUSCLE_GROUPS.forEach((group) => {
      expect(Array.isArray(group.subgroups)).toBe(true);
    });
  });

  it("arms should have biceps, triceps, forearms subgroups", () => {
    const arms = MUSCLE_GROUPS.find((g) => g.id === "arms");
    expect(arms).toBeDefined();
    expect(arms?.subgroups).toContain("biceps");
    expect(arms?.subgroups).toContain("triceps");
    expect(arms?.subgroups).toContain("forearms");
  });

  it("legs should have quads, hamstrings, calves subgroups", () => {
    const legs = MUSCLE_GROUPS.find((g) => g.id === "legs");
    expect(legs).toBeDefined();
    expect(legs?.subgroups).toContain("quads");
    expect(legs?.subgroups).toContain("hamstrings");
    expect(legs?.subgroups).toContain("calves");
  });
});

describe("MuscleGroup type", () => {
  it("should accept valid muscle group ids", () => {
    const validId: MuscleGroup = "arms";
    expect(validId).toBe("arms");
  });

  it("type should be one of the defined groups", () => {
    // This is more of a compile-time check, but we can verify at runtime
    const validIds: MuscleGroup[] = [
      "arms",
      "back",
      "chest",
      "core",
      "glutes",
      "legs",
      "shoulders",
      "full_body",
    ];

    validIds.forEach((id) => {
      expect(MUSCLE_GROUPS.find((g) => g.id === id)).toBeDefined();
    });
  });
});
