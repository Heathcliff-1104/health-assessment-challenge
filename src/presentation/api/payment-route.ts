import type { NextRequest } from "next/server";
import { activateMockSubscription } from "@/application/payment/payment-service";
import { requireSession } from "@/presentation/api/auth";
import { requireIdempotencyKey } from "@/presentation/api/headers";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

export async function handleMockPayment(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireSession(request);
    const subscription = await activateMockSubscription(
      session.id,
      requireIdempotencyKey(request.headers.get("idempotency-key")),
      await request.json(),
    );
    return successResponse(subscription, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
