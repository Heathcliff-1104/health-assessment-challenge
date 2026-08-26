import { createHash } from "node:crypto";
import { Prisma, type Assessment } from "@/generated/prisma/client";
import { ApplicationError } from "@/application/errors";
import {
  stepSchemas,
  weightTargetContextSchema,
  type StepKey as ApiStepKey,
} from "@/domain/health";
import { prisma } from "@/infrastructure/db/prisma";

const STEP_ORDER: ApiStepKey[] = [
  "gender",
  "goal",
  "body_profile",
  "weight_goal",
  "activity",
];

const STEP_TO_DATABASE = {
  gender: "GENDER",
  goal: "GOAL",
  body_profile: "BODY_PROFILE",
  weight_goal: "WEIGHT_GOAL",
  activity: "ACTIVITY",
} as const;

const DATABASE_TO_STEP = {
  GENDER: "gender",
  GOAL: "goal",
  BODY_PROFILE: "body_profile",
  WEIGHT_GOAL: "weight_goal",
  ACTIVITY: "activity",
} as const;

const GENDER_TO_DATABASE = {
  male: "MALE",
  female: "FEMALE",
  non_binary: "NON_BINARY",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
} as const;

const GOAL_TO_DATABASE = {
  lose_weight: "LOSE_WEIGHT",
  maintain_weight: "MAINTAIN_WEIGHT",
  gain_weight: "GAIN_WEIGHT",
} as const;

const DATABASE_TO_GOAL = {
  LOSE_WEIGHT: "lose_weight",
  MAINTAIN_WEIGHT: "maintain_weight",
  GAIN_WEIGHT: "gain_weight",
} as const;

const ACTIVITY_TO_DATABASE = {
  sedentary: "SEDENTARY",
  light: "LIGHT",
  moderate: "MODERATE",
  active: "ACTIVE",
  very_active: "VERY_ACTIVE",
} as const;

function validationFields(error: import("zod").ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "body");
    fields[field] ??= [];
    fields[field].push(issue.message);
  }
  return fields;
}

function parseStep(stepKey: string, payload: unknown) {
  if (!(stepKey in stepSchemas)) {
    throw new ApplicationError("RESOURCE_NOT_FOUND", "Unknown assessment step", 404);
  }

  const apiStep = stepKey as ApiStepKey;
  const parsed = stepSchemas[apiStep].safeParse(payload);
  if (!parsed.success) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "The step payload is invalid",
      422,
      validationFields(parsed.error),
    );
  }
  return { apiStep, payload: parsed.data };
}

function updateForStep(
  step: ApiStepKey,
  payload: Record<string, unknown>,
): Prisma.AssessmentUpdateManyMutationInput {
  switch (step) {
    case "gender":
      return { gender: GENDER_TO_DATABASE[payload.gender as keyof typeof GENDER_TO_DATABASE] };
    case "goal":
      return { goal: GOAL_TO_DATABASE[payload.goal as keyof typeof GOAL_TO_DATABASE] };
    case "body_profile":
      return { age: payload.age as number, heightCm: payload.heightCm as number };
    case "weight_goal":
      return {
        weightKg: payload.weightKg as number,
        targetWeightKg: payload.targetWeightKg as number,
      };
    case "activity":
      return {
        activityLevel:
          ACTIVITY_TO_DATABASE[
            payload.activityLevel as keyof typeof ACTIVITY_TO_DATABASE
          ],
      };
  }
}

export async function getOrCreateActiveAssessment(
  userSessionId: string,
): Promise<Assessment> {
  const existing = await prisma.assessment.findFirst({
    where: { userSessionId, status: "IN_PROGRESS" },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  try {
    return await prisma.assessment.create({ data: { userSessionId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedAssessment = await prisma.assessment.findFirst({
        where: { userSessionId, status: "IN_PROGRESS" },
      });
      if (racedAssessment) return racedAssessment;
    }
    throw error;
  }
}

export async function getCurrentAssessment(
  userSessionId: string,
): Promise<Assessment | null> {
  return prisma.assessment.findFirst({
    where: { userSessionId },
    orderBy: { updatedAt: "desc" },
  });
}

export interface SaveStepCommand {
  userSessionId: string;
  assessmentId: string;
  stepKey: string;
  payload: unknown;
  expectedVersion: number;
  idempotencyKey: string;
}

export async function saveAssessmentStep(command: SaveStepCommand): Promise<Assessment> {
  if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "If-Match must contain a non-negative assessment version",
      422,
    );
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(command.idempotencyKey)) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Idempotency-Key must contain 8 to 128 safe characters",
      422,
    );
  }

  const parsed = parseStep(command.stepKey, command.payload);
  const requestHash = createHash("sha256")
    .update(JSON.stringify(parsed.payload))
    .digest("hex");

  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findFirst({
      where: { id: command.assessmentId, userSessionId: command.userSessionId },
    });
    if (!assessment) {
      throw new ApplicationError("RESOURCE_NOT_FOUND", "Assessment not found", 404);
    }

    const duplicate = await transaction.assessmentStepSubmission.findUnique({
      where: {
        assessmentId_idempotencyKey: {
          assessmentId: assessment.id,
          idempotencyKey: command.idempotencyKey,
        },
      },
    });
    if (duplicate) {
      if (duplicate.requestHash !== requestHash) {
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "The idempotency key was already used with different content",
          409,
        );
      }
      return assessment;
    }

    if (assessment.status === "COMPLETED") {
      throw new ApplicationError(
        "ASSESSMENT_ALREADY_COMPLETED",
        "Completed assessments cannot be changed",
        409,
      );
    }

    if (parsed.apiStep === "weight_goal") {
      if (!assessment.goal || !assessment.heightCm) {
        throw new ApplicationError(
          "STEP_OUT_OF_ORDER",
          "Complete goal and body_profile before weight_goal",
          409,
        );
      }
      const contextualResult = weightTargetContextSchema.safeParse({
        goal: DATABASE_TO_GOAL[assessment.goal],
        heightCm: Number(assessment.heightCm),
        ...parsed.payload,
      });
      if (!contextualResult.success) {
        throw new ApplicationError(
          "VALIDATION_ERROR",
          "The weight target is invalid",
          422,
          validationFields(contextualResult.error),
        );
      }
    }
    if (assessment.version !== command.expectedVersion) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "The assessment was changed by another request",
        409,
      );
    }

    const currentIndex = assessment.currentStep
      ? STEP_ORDER.indexOf(DATABASE_TO_STEP[assessment.currentStep])
      : -1;
    const submittedIndex = STEP_ORDER.indexOf(parsed.apiStep);
    if (submittedIndex > currentIndex + 1) {
      throw new ApplicationError(
        "STEP_OUT_OF_ORDER",
        `Complete ${STEP_ORDER[currentIndex + 1]} before ${parsed.apiStep}`,
        409,
      );
    }

    const nextCurrentStep = STEP_ORDER[Math.max(currentIndex, submittedIndex)];
    const updated = await transaction.assessment.updateMany({
      where: {
        id: assessment.id,
        userSessionId: command.userSessionId,
        status: "IN_PROGRESS",
        version: command.expectedVersion,
      },
      data: {
        ...updateForStep(parsed.apiStep, parsed.payload),
        currentStep: STEP_TO_DATABASE[nextCurrentStep],
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "The assessment was changed by another request",
        409,
      );
    }

    await transaction.assessmentStepSubmission.create({
      data: {
        assessmentId: assessment.id,
        stepKey: STEP_TO_DATABASE[parsed.apiStep],
        idempotencyKey: command.idempotencyKey,
        requestHash,
        payload: parsed.payload,
        assessmentVersion: command.expectedVersion + 1,
      },
    });

    return transaction.assessment.findUniqueOrThrow({ where: { id: assessment.id } });
  });
}
