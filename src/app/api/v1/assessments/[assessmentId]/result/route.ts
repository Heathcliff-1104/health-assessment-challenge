import type { NextRequest } from "next/server";
import { getAssessmentResult } from "@/application/assessment/result-service";
import { requireSession } from "@/presentation/api/auth";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

interface ResultRouteContext {
  params: Promise<{ assessmentId: string }>;
}

export async function GET(request: NextRequest, context: ResultRouteContext) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const { assessmentId } = await context.params;
    const result = await getAssessmentResult(session.id, assessmentId);
    return successResponse(result, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
