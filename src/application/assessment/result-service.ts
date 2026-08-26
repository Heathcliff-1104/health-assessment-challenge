import { ApplicationError } from "@/application/errors";
import {
  buildFullResult,
  buildPreviewResult,
} from "@/application/assessment/result-dto";
import { prisma } from "@/infrastructure/db/prisma";

export async function getAssessmentResult(
  userSessionId: string,
  assessmentId: string,
  now = new Date(),
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, userSessionId },
    include: {
      result: true,
      userSession: { include: { subscription: true } },
    },
  });
  if (!assessment) {
    throw new ApplicationError("RESOURCE_NOT_FOUND", "Assessment not found", 404);
  }
  if (!assessment.result) {
    throw new ApplicationError(
      "ASSESSMENT_INCOMPLETE",
      "Complete the assessment before requesting a result",
      409,
    );
  }

  const subscription = assessment.userSession.subscription;
  const hasFullAccess =
    subscription?.status === "ACTIVE" &&
    Boolean(subscription.expiresAt && subscription.expiresAt > now);

  if (!hasFullAccess) {
    return buildPreviewResult(assessment.id, assessment.result);
  }

  return buildFullResult(assessment.id, assessment.result);
}
