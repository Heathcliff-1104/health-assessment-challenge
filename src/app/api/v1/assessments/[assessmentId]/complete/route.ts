import type { NextRequest } from "next/server";
import { completeAssessment } from "@/application/assessment/complete-assessment";
import { getAssessmentResult } from "@/application/assessment/result-service";
import { requireSession } from "@/presentation/api/auth";
import { parseExpectedVersion } from "@/presentation/api/headers";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

interface CompleteRouteContext {
  params: Promise<{ assessmentId: string }>;
}

export async function POST(request: NextRequest, context: CompleteRouteContext) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const { assessmentId } = await context.params;
    await completeAssessment(
      session.id,
      assessmentId,
      parseExpectedVersion(request.headers.get("if-match")),
    );
    const result = await getAssessmentResult(session.id, assessmentId);
    return successResponse(result, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
