import type { Assessment } from "@/generated/prisma/client";

const stepToApi = {
  GENDER: "gender",
  GOAL: "goal",
  BODY_PROFILE: "body_profile",
  WEIGHT_GOAL: "weight_goal",
  ACTIVITY: "activity",
} as const;

const genderToApi = {
  MALE: "male",
  FEMALE: "female",
  NON_BINARY: "non_binary",
  PREFER_NOT_TO_SAY: "prefer_not_to_say",
} as const;

const goalToApi = {
  LOSE_WEIGHT: "lose_weight",
  MAINTAIN_WEIGHT: "maintain_weight",
  GAIN_WEIGHT: "gain_weight",
} as const;

const activityToApi = {
  SEDENTARY: "sedentary",
  LIGHT: "light",
  MODERATE: "moderate",
  ACTIVE: "active",
  VERY_ACTIVE: "very_active",
} as const;

const orderedSteps = [
  "gender",
  "goal",
  "body_profile",
  "weight_goal",
  "activity",
] as const;

export function toAssessmentDto(assessment: Assessment) {
  const currentStep = assessment.currentStep
    ? stepToApi[assessment.currentStep]
    : null;
  const currentIndex = currentStep ? orderedSteps.indexOf(currentStep) : -1;

  return {
    id: assessment.id,
    status: assessment.status.toLowerCase(),
    currentStep,
    nextStep: orderedSteps[currentIndex + 1] ?? null,
    version: assessment.version,
    answers: {
      gender: assessment.gender ? genderToApi[assessment.gender] : null,
      goal: assessment.goal ? goalToApi[assessment.goal] : null,
      age: assessment.age,
      heightCm: assessment.heightCm ? Number(assessment.heightCm) : null,
      weightKg: assessment.weightKg ? Number(assessment.weightKg) : null,
      targetWeightKg: assessment.targetWeightKg
        ? Number(assessment.targetWeightKg)
        : null,
      activityLevel: assessment.activityLevel
        ? activityToApi[assessment.activityLevel]
        : null,
    },
    updatedAt: assessment.updatedAt.toISOString(),
  };
}
