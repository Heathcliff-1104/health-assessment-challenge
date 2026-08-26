import { createAnonymousSession } from "@/application/session-service";
import { SESSION_COOKIE_NAME } from "@/presentation/api/auth";
import {
  createRequestId,
  errorResponse,
  successResponse,
} from "@/presentation/api/responses";

export async function POST() {
  const requestId = createRequestId();
  try {
    const session = await createAnonymousSession();
    const response = successResponse(
      {
        sessionId: session.id,
        sessionToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
      },
      requestId,
      201,
    );
    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
