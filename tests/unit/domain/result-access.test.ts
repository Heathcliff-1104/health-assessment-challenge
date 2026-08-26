import { Decimal } from "@prisma/client/runtime/client";
import { describe, expect, it } from "vitest";
import type { AssessmentResult } from "@/generated/prisma/client";
import {
  buildFullResult,
  buildPreviewResult,
  PROTECTED_RESULT_FIELDS,
} from "@/application/assessment/result-dto";

const storedResult: AssessmentResult = {
  id: "9cc0c52f-1c64-4959-9291-2c643d9892a9",
  assessmentId: "95aac41c-e014-42de-a7a4-8f7800c96c2f",
  algorithmVersion: "health-v1",
  bmi: new Decimal("25.7"),
  bmiCategory: "overweight",
  basalMetabolicRate: 1410,
  totalDailyEnergy: 2186,
  recommendedDailyCalories: 1686,
  predictedTargetDate: new Date("2026-07-23T00:00:00.000Z"),
  weeklyProjection: [{ week: 0, date: "2026-01-01", weightKg: 70 }],
  calculatedAt: new Date("2026-01-01T12:00:00.000Z"),
};

describe("result access DTOs", () => {
  it("never serializes protected values for a preview response", () => {
    const preview = buildPreviewResult(storedResult.assessmentId, storedResult);
    const serialized = JSON.stringify(preview);

    expect(preview.access).toBe("preview");
    expect(preview.upgradeRequired).toBe(true);
    for (const field of PROTECTED_RESULT_FIELDS) {
      expect(Object.hasOwn(preview, field)).toBe(false);
    }
    expect(serialized).not.toContain("1686");
    expect(serialized).not.toContain("2026-07-23");
    expect(serialized).not.toContain('"weightKg":70');
  });

  it("includes all protected values for an active subscriber", () => {
    const full = buildFullResult(storedResult.assessmentId, storedResult);

    expect(full).toMatchObject({
      access: "full",
      recommendedDailyCalories: 1686,
      predictedTargetDate: "2026-07-23",
      upgradeRequired: false,
    });
    expect(full.weeklyProjection).toEqual(storedResult.weeklyProjection);
  });
});
