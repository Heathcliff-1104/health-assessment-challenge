import { describe, expect, it } from "vitest";
import {
  assessmentInputSchema,
  stepSchemas,
  weightTargetContextSchema,
  type AssessmentInput,
} from "@/domain/health";

const validInput: AssessmentInput = {
  gender: "female",
  goal: "lose_weight",
  age: 32,
  heightCm: 165,
  weightKg: 70,
  targetWeightKg: 60,
  activityLevel: "moderate",
};

describe("assessmentInputSchema", () => {
  it("accepts a complete valid assessment", () => {
    expect(assessmentInputSchema.parse(validInput)).toEqual(validInput);
  });

  it.each([
    ["minimum", { age: 18, heightCm: 120, weightKg: 40, targetWeightKg: 35 }],
    ["maximum", { age: 100, heightCm: 230, weightKg: 300, targetWeightKg: 200 }],
  ])("accepts the %s supported boundaries", (_, overrides) => {
    expect(
      assessmentInputSchema.safeParse({ ...validInput, ...overrides }).success,
    ).toBe(true);
  });

  it.each([
    ["underage", { age: 17 }],
    ["age above maximum", { age: 101 }],
    ["fractional age", { age: 32.5 }],
    ["height below minimum", { heightCm: 119.9 }],
    ["height above maximum", { heightCm: 230.1 }],
    ["weight below minimum", { weightKg: 34.9 }],
    ["weight above maximum", { weightKg: 300.1 }],
    ["numeric string", { age: "32" }],
    ["null", { heightCm: null }],
    ["array", { weightKg: [70] }],
    ["infinite number", { weightKg: Number.POSITIVE_INFINITY }],
    ["NaN", { heightCm: Number.NaN }],
  ])("rejects %s", (_, overrides) => {
    expect(
      assessmentInputSchema.safeParse({ ...validInput, ...overrides }).success,
    ).toBe(false);
  });

  it("rejects missing and unknown fields", () => {
    const missingAge: Partial<AssessmentInput> = { ...validInput };
    delete missingAge.age;
    expect(assessmentInputSchema.safeParse(missingAge).success).toBe(false);
    expect(
      assessmentInputSchema.safeParse({ ...validInput, isAdmin: true }).success,
    ).toBe(false);
  });

  it.each([
    ["loss target above current weight", { targetWeightKg: 71 }],
    ["loss target equal to current weight", { targetWeightKg: 70 }],
    [
      "gain target below current weight",
      { goal: "gain_weight", targetWeightKg: 65 },
    ],
    [
      "maintenance target too far away",
      { goal: "maintain_weight", targetWeightKg: 73 },
    ],
    ["target difference above 50%", { targetWeightKg: 35 }],
    ["target BMI below supported range", { heightCm: 190, targetWeightKg: 50 }],
  ])("rejects an unreasonable %s", (_, overrides) => {
    expect(
      assessmentInputSchema.safeParse({ ...validInput, ...overrides }).success,
    ).toBe(false);
  });

  it("validates each incremental step strictly", () => {
    expect(stepSchemas.gender.parse({ gender: "male" })).toEqual({ gender: "male" });
    expect(
      stepSchemas.gender.safeParse({ gender: "male", role: "admin" }).success,
    ).toBe(false);
    expect(stepSchemas.body_profile.safeParse({ age: 32 }).success).toBe(false);
  });

  it("validates a weight step against goal and previously saved height", () => {
    expect(
      weightTargetContextSchema.safeParse({
        goal: "lose_weight",
        heightCm: 165,
        weightKg: 70,
        targetWeightKg: 75,
      }).success,
    ).toBe(false);
    expect(
      weightTargetContextSchema.safeParse({
        goal: "lose_weight",
        heightCm: 165,
        weightKg: 70,
        targetWeightKg: 60,
      }).success,
    ).toBe(true);
  });
});
