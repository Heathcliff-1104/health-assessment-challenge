import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ALGORITHM_VERSION,
  calculateHealthAssessment,
  classifyBmi,
  type AssessmentClock,
  type AssessmentInput,
} from "@/domain/health";

const fixedClock: AssessmentClock = {
  now: () => new Date("2026-01-01T12:00:00.000Z"),
};

const baseInput: AssessmentInput = {
  gender: "female",
  goal: "lose_weight",
  age: 32,
  heightCm: 165,
  weightKg: 70,
  targetWeightKg: 60,
  activityLevel: "moderate",
};

describe("calculateHealthAssessment", () => {
  it("calculates a deterministic, persisted-shape result", () => {
    const result = calculateHealthAssessment(baseInput, fixedClock);

    expect(result).toMatchObject({
      algorithmVersion: ALGORITHM_VERSION,
      bmi: 25.7,
      bmiCategory: "overweight",
      basalMetabolicRate: 1410,
      totalDailyEnergy: 2186,
      recommendedDailyCalories: 1686,
      predictedTargetDate: "2026-07-23",
    });
    expect(result.weeklyProjection[0]).toEqual({
      week: 0,
      date: "2026-01-01",
      weightKg: 70,
    });
    expect(result.weeklyProjection.at(-1)?.weightKg).toBe(60);
  });

  it.each([
    [18.4, "underweight"],
    [18.5, "healthy_range"],
    [24.9, "healthy_range"],
    [25, "overweight"],
    [29.9, "overweight"],
    [30, "obesity_range"],
  ] as const)("classifies BMI %s as %s", (bmi, expected) => {
    expect(classifyBmi(bmi)).toBe(expected);
  });

  it("applies a calorie floor for small sedentary adults", () => {
    const result = calculateHealthAssessment(
      {
        ...baseInput,
        age: 70,
        heightCm: 150,
        weightKg: 50,
        targetWeightKg: 45,
        activityLevel: "sedentary",
      },
      fixedClock,
    );

    expect(result.recommendedDailyCalories).toBe(1200);
  });

  it("uses a neutral estimate when gender-specific input is unavailable", () => {
    const nonBinary = calculateHealthAssessment(
      { ...baseInput, gender: "non_binary" },
      fixedClock,
    );
    const undisclosed = calculateHealthAssessment(
      { ...baseInput, gender: "prefer_not_to_say" },
      fixedClock,
    );

    expect(nonBinary.basalMetabolicRate).toBe(undisclosed.basalMetabolicRate);
    expect(nonBinary.recommendedDailyCalories).toBeGreaterThanOrEqual(1300);
  });

  it("returns a one-point projection for maintenance", () => {
    const result = calculateHealthAssessment(
      {
        ...baseInput,
        goal: "maintain_weight",
        targetWeightKg: 70,
      },
      fixedClock,
    );

    expect(result.predictedTargetDate).toBe("2026-01-01");
    expect(result.weeklyProjection).toEqual([
      { week: 0, date: "2026-01-01", weightKg: 70 },
    ]);
  });

  it("creates a monotonic increasing projection for a gain goal", () => {
    const result = calculateHealthAssessment(
      {
        ...baseInput,
        goal: "gain_weight",
        targetWeightKg: 75,
      },
      fixedClock,
    );

    for (let index = 1; index < result.weeklyProjection.length; index += 1) {
      expect(result.weeklyProjection[index].weightKg).toBeGreaterThanOrEqual(
        result.weeklyProjection[index - 1].weightKg,
      );
    }
    expect(result.weeklyProjection.at(-1)?.weightKg).toBe(75);
  });

  it("keeps valid BMI and calorie outputs finite across the supported range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 18, max: 100 }),
        fc.double({ min: 120, max: 230, noNaN: true }),
        fc.double({ min: 35, max: 300, noNaN: true }),
        (age, heightCm, weightKg) => {
          const result = calculateHealthAssessment(
            {
              ...baseInput,
              age,
              heightCm,
              weightKg,
              targetWeightKg: weightKg,
              goal: "maintain_weight",
            },
            fixedClock,
          );

          expect(Number.isFinite(result.bmi)).toBe(true);
          expect(Number.isFinite(result.recommendedDailyCalories)).toBe(true);
          expect(result.recommendedDailyCalories).toBeGreaterThanOrEqual(1200);
          expect(result.recommendedDailyCalories).toBeLessThanOrEqual(4500);
        },
      ),
    );
  });
});
