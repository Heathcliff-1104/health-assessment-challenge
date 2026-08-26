import type { NextRequest } from "next/server";
import { getCurrentAssessment } from "@/application/assessment/assessment-service";
import { toAssessmentDto } from "@/application/assessment/assessment-dto";
import { requireSession } from "@/presentation/api/auth";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const assessment = await getCurrentAssessment(session.id);
    return successResponse(assessment ? toAssessmentDto(assessment) : null, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
