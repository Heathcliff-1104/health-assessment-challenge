import type { UserSession } from "@/generated/prisma/client";
import { ApplicationError } from "@/application/errors";
import { createSessionToken, hashSessionToken } from "@/application/session-tokens";
import { prisma } from "@/infrastructure/db/prisma";

const SESSION_LIFETIME_DAYS = 30;

export interface CreatedSession {
  id: string;
  token: string;
  expiresAt: Date;
}

export async function createAnonymousSession(now = new Date()): Promise<CreatedSession> {
  const token = createSessionToken();
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + SESSION_LIFETIME_DAYS);

  const session = await prisma.userSession.create({
    data: {
      sessionTokenHash: hashSessionToken(token),
      expiresAt,
      subscription: { create: {} },
    },
  });

  return { id: session.id, token, expiresAt: session.expiresAt };
}

export async function authenticateSessionToken(
  token: string | undefined,
  now = new Date(),
): Promise<UserSession> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new ApplicationError(
      "AUTHENTICATION_REQUIRED",
      "A valid session token is required",
      401,
    );
  }

  const session = await prisma.userSession.findUnique({
    where: { sessionTokenHash: hashSessionToken(token) },
  });

  if (!session || session.revokedAt || session.expiresAt <= now) {
    throw new ApplicationError("SESSION_INVALID", "The session is invalid or expired", 401);
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now },
  });

  return session;
}
