import type { NextRequest } from "next/server";
import { saveAssessmentStep } from "@/application/assessment/assessment-service";
import { toAssessmentDto } from "@/application/assessment/assessment-dto";
import { requireSession } from "@/presentation/api/auth";
import {
  parseExpectedVersion,
  requireIdempotencyKey,
} from "@/presentation/api/headers";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

interface StepRouteContext {
  params: Promise<{ assessmentId: string; stepKey: string }>;
}

export async function PUT(request: NextRequest, context: StepRouteContext) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const { assessmentId, stepKey } = await context.params;
    const assessment = await saveAssessmentStep({
      userSessionId: session.id,
      assessmentId,
      stepKey,
      payload: await request.json(),
      expectedVersion: parseExpectedVersion(request.headers.get("if-match")),
      idempotencyKey: requireIdempotencyKey(
        request.headers.get("idempotency-key"),
      ),
    });
    return successResponse(toAssessmentDto(assessment), requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
