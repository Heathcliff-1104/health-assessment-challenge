import type { AssessmentResult } from "@/generated/prisma/client";

export const PROTECTED_RESULT_FIELDS = [
  "basalMetabolicRate",
  "totalDailyEnergy",
  "recommendedDailyCalories",
  "predictedTargetDate",
  "weeklyProjection",
] as const;

export function buildPreviewResult(
  assessmentId: string,
  result: Pick<AssessmentResult, "bmi" | "bmiCategory">,
) {
  return {
    access: "preview" as const,
    assessmentId,
    bmi: Number(result.bmi),
    bmiCategory: result.bmiCategory,
    summary: "Your personalized health plan is ready.",
    lockedFields: PROTECTED_RESULT_FIELDS,
    upgradeRequired: true,
  };
}

export function buildFullResult(assessmentId: string, result: AssessmentResult) {
  return {
    access: "full" as const,
    assessmentId,
    algorithmVersion: result.algorithmVersion,
    bmi: Number(result.bmi),
    bmiCategory: result.bmiCategory,
    basalMetabolicRate: result.basalMetabolicRate,
    totalDailyEnergy: result.totalDailyEnergy,
    recommendedDailyCalories: result.recommendedDailyCalories,
    predictedTargetDate: result.predictedTargetDate.toISOString().slice(0, 10),
    weeklyProjection: result.weeklyProjection,
    calculatedAt: result.calculatedAt.toISOString(),
    upgradeRequired: false,
  };
}
