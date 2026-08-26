import { Prisma, type AssessmentResult } from "@/generated/prisma/client";
import { ApplicationError } from "@/application/errors";
import {
  assessmentInputSchema,
  calculateHealthAssessment,
  type ActivityLevel,
  type AssessmentGoal,
  type Gender,
} from "@/domain/health";
import { prisma } from "@/infrastructure/db/prisma";

const GENDER_FROM_DATABASE: Record<string, Gender> = {
  MALE: "male",
  FEMALE: "female",
  NON_BINARY: "non_binary",
  PREFER_NOT_TO_SAY: "prefer_not_to_say",
};

const GOAL_FROM_DATABASE: Record<string, AssessmentGoal> = {
  LOSE_WEIGHT: "lose_weight",
  MAINTAIN_WEIGHT: "maintain_weight",
  GAIN_WEIGHT: "gain_weight",
};

const ACTIVITY_FROM_DATABASE: Record<string, ActivityLevel> = {
  SEDENTARY: "sedentary",
  LIGHT: "light",
  MODERATE: "moderate",
  ACTIVE: "active",
  VERY_ACTIVE: "very_active",
};

function validationFields(error: import("zod").ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "body");
    fields[field] ??= [];
    fields[field].push(issue.message);
  }
  return fields;
}

export async function completeAssessment(
  userSessionId: string,
  assessmentId: string,
  expectedVersion: number,
): Promise<AssessmentResult> {
  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findFirst({
      where: { id: assessmentId, userSessionId },
      include: { result: true },
    });
    if (!assessment) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Assessment not found", 404);
    }
    if (assessment.result) return assessment.result;
    if (assessment.status === "COMPLETED") {
      throw new ApplicationError(
        "ASSESSMENT_ALREADY_COMPLETED",
        "The assessment is already completed",
        409,
      );
    }
    if (assessment.version !== expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "The assessment was changed by another request",
        409,
      );
    }

    const parsed = assessmentInputSchema.safeParse({
      gender: assessment.gender
        ? GENDER_FROM_DATABASE[assessment.gender]
        : undefined,
      goal: assessment.goal ? GOAL_FROM_DATABASE[assessment.goal] : undefined,
      age: assessment.age ?? undefined,
      heightCm: assessment.heightCm ? Number(assessment.heightCm) : undefined,
      weightKg: assessment.weightKg ? Number(assessment.weightKg) : undefined,
      targetWeightKg: assessment.targetWeightKg
        ? Number(assessment.targetWeightKg)
        : undefined,
      activityLevel: assessment.activityLevel
        ? ACTIVITY_FROM_DATABASE[assessment.activityLevel]
        : undefined,
    });
    if (!parsed.success) {
      throw new ApplicationError(
        "ASSESSMENT_INCOMPLETE",
        "Complete all required fields with valid values before calculation",
        422,
        validationFields(parsed.error),
      );
    }

    const calculated = calculateHealthAssessment(parsed.data);
    const updated = await transaction.assessment.updateMany({
      where: {
        id: assessment.id,
        userSessionId,
        status: "IN_PROGRESS",
        version: expectedVersion,
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "The assessment was completed by another request",
        409,
      );
    }

    return transaction.assessmentResult.create({
      data: {
        assessmentId: assessment.id,
        algorithmVersion: calculated.algorithmVersion,
        bmi: calculated.bmi,
        bmiCategory: calculated.bmiCategory,
        basalMetabolicRate: calculated.basalMetabolicRate,
        totalDailyEnergy: calculated.totalDailyEnergy,
        recommendedDailyCalories: calculated.recommendedDailyCalories,
        predictedTargetDate: new Date(
          `${calculated.predictedTargetDate}T00:00:00.000Z`,
        ),
        weeklyProjection:
          calculated.weeklyProjection as unknown as Prisma.InputJsonValue,
      },
    });
  });
}
