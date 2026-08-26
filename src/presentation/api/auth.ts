import type { NextRequest } from "next/server";
import { authenticateSessionToken } from "@/application/session-service";

export const SESSION_COOKIE_NAME = "health_session";

function bearerToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim();
}

export function sessionTokenFromRequest(request: NextRequest): string | undefined {
  return bearerToken(request) ?? request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export async function requireSession(request: NextRequest) {
  return authenticateSessionToken(sessionTokenFromRequest(request));
}
