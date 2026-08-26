import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { ApplicationError } from "@/application/errors";
import { prisma } from "@/infrastructure/db/prisma";

const paymentSchema = z.strictObject({
  planCode: z.literal("demo_monthly").default("demo_monthly"),
});

export async function activateMockSubscription(
  userSessionId: string,
  idempotencyKey: string,
  payload: unknown,
  now = new Date(),
) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Idempotency-Key must contain 8 to 128 safe characters",
      422,
    );
  }
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "The payment payload is invalid",
      422,
      { planCode: parsed.error.issues.map((issue) => issue.message) },
    );
  }

  const completedAssessment = await prisma.assessment.findFirst({
    where: { userSessionId, status: "COMPLETED", result: { isNot: null } },
  });
  if (!completedAssessment) {
    throw new ApplicationError(
      "ASSESSMENT_INCOMPLETE",
      "Complete an assessment before activating the demo subscription",
      409,
    );
  }

  const externalEventId = createHash("sha256")
    .update(`${userSessionId}:${idempotencyKey}`)
    .digest("hex");
  const requestHash = createHash("sha256")
    .update(JSON.stringify(parsed.data))
    .digest("hex");
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);

  const processPayment = async () =>
    prisma.$transaction(async (transaction) => {
      const existing = await transaction.paymentEvent.findUnique({
        where: { externalEventId },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used with different content",
            409,
          );
        }
        return transaction.subscription.findUniqueOrThrow({
          where: { userSessionId },
        });
      }

      const subscription = await transaction.subscription.upsert({
        where: { userSessionId },
        create: {
          userSessionId,
          status: "ACTIVE",
          planCode: parsed.data.planCode,
          startedAt: now,
          expiresAt,
        },
        update: {
          status: "ACTIVE",
          planCode: parsed.data.planCode,
          startedAt: now,
          expiresAt,
        },
      });
      await transaction.paymentEvent.create({
        data: {
          userSessionId,
          externalEventId,
          status: "SUCCEEDED",
          requestHash,
          payload: parsed.data,
        },
      });
      return subscription;
    });

  try {
    const subscription = await processPayment();
    return {
      status: subscription.status.toLowerCase(),
      planCode: subscription.planCode,
      startedAt: subscription.startedAt?.toISOString() ?? null,
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      simulated: true,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const event = await prisma.paymentEvent.findUnique({ where: { externalEventId } });
      if (event?.requestHash === requestHash) {
        const subscription = await prisma.subscription.findUniqueOrThrow({
          where: { userSessionId },
        });
        return {
          status: subscription.status.toLowerCase(),
          planCode: subscription.planCode,
          startedAt: subscription.startedAt?.toISOString() ?? null,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
          simulated: true,
        };
      }
    }
    throw error;
  }
}
