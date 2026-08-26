import type { NextRequest } from "next/server";
import { getOrCreateActiveAssessment } from "@/application/assessment/assessment-service";
import { toAssessmentDto } from "@/application/assessment/assessment-dto";
import { requireSession } from "@/presentation/api/auth";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const assessment = await getOrCreateActiveAssessment(session.id);
    return successResponse(toAssessmentDto(assessment), requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
