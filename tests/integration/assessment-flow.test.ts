import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

type Services = {
  prisma: typeof import("@/infrastructure/db/prisma").prisma;
  createAnonymousSession: typeof import("@/application/session-service").createAnonymousSession;
  getOrCreateActiveAssessment: typeof import("@/application/assessment/assessment-service").getOrCreateActiveAssessment;
  getCurrentAssessment: typeof import("@/application/assessment/assessment-service").getCurrentAssessment;
  saveAssessmentStep: typeof import("@/application/assessment/assessment-service").saveAssessmentStep;
  completeAssessment: typeof import("@/application/assessment/complete-assessment").completeAssessment;
  getAssessmentResult: typeof import("@/application/assessment/result-service").getAssessmentResult;
  activateMockSubscription: typeof import("@/application/payment/payment-service").activateMockSubscription;
};

let services: Services;

async function expectApplicationError(
  action: Promise<unknown>,
  code: string,
) {
  await expect(action).rejects.toMatchObject({ code });
}

describeWithDatabase("assessment persistence and subscription flow", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [db, session, assessment, completion, result, payment] =
      await Promise.all([
        import("@/infrastructure/db/prisma"),
        import("@/application/session-service"),
        import("@/application/assessment/assessment-service"),
        import("@/application/assessment/complete-assessment"),
        import("@/application/assessment/result-service"),
        import("@/application/payment/payment-service"),
      ]);
    services = {
      prisma: db.prisma,
      createAnonymousSession: session.createAnonymousSession,
      getOrCreateActiveAssessment: assessment.getOrCreateActiveAssessment,
      getCurrentAssessment: assessment.getCurrentAssessment,
      saveAssessmentStep: assessment.saveAssessmentStep,
      completeAssessment: completion.completeAssessment,
      getAssessmentResult: result.getAssessmentResult,
      activateMockSubscription: payment.activateMockSubscription,
    };
  });

  beforeEach(async () => {
    await services.prisma.userSession.deleteMany();
  });

  it("persists incremental steps, resumes progress, and rejects invalid ordering", async () => {
    const session = await services.createAnonymousSession();
    const assessment = await services.getOrCreateActiveAssessment(session.id);

    await expectApplicationError(
      services.saveAssessmentStep({
        userSessionId: session.id,
        assessmentId: assessment.id,
        stepKey: "activity",
        payload: { activityLevel: "moderate" },
        expectedVersion: 0,
        idempotencyKey: "out-order-0001",
      }),
      "STEP_OUT_OF_ORDER",
    );

    const gender = await services.saveAssessmentStep({
      userSessionId: session.id,
      assessmentId: assessment.id,
      stepKey: "gender",
      payload: { gender: "female" },
      expectedVersion: 0,
      idempotencyKey: "gender-save-0001",
    });
    const goal = await services.saveAssessmentStep({
      userSessionId: session.id,
      assessmentId: assessment.id,
      stepKey: "goal",
      payload: { goal: "lose_weight" },
      expectedVersion: gender.version,
      idempotencyKey: "goal-save-000001",
    });
    const body = await services.saveAssessmentStep({
      userSessionId: session.id,
      assessmentId: assessment.id,
      stepKey: "body_profile",
      payload: { age: 32, heightCm: 165 },
      expectedVersion: goal.version,
      idempotencyKey: "body-save-000001",
    });

    await expectApplicationError(
      services.saveAssessmentStep({
        userSessionId: session.id,
        assessmentId: assessment.id,
        stepKey: "weight_goal",
        payload: { weightKg: 70, targetWeightKg: 75 },
        expectedVersion: body.version,
        idempotencyKey: "bad-target-0001",
      }),
      "VALIDATION_ERROR",
    );

    const saved = await services.saveAssessmentStep({
      userSessionId: session.id,
      assessmentId: assessment.id,
      stepKey: "weight_goal",
      payload: { weightKg: 70, targetWeightKg: 60 },
      expectedVersion: body.version,
      idempotencyKey: "weight-save-0001",
    });
    const recovered = await services.getCurrentAssessment(session.id);

    expect(saved.version).toBe(4);
    expect(recovered).toMatchObject({
      id: assessment.id,
      currentStep: "WEIGHT_GOAL",
      version: 4,
    });
    expect(Number(recovered?.targetWeightKg)).toBe(60);
  });

  it("makes retries idempotent and detects key reuse with changed content", async () => {
    const session = await services.createAnonymousSession();
    const assessment = await services.getOrCreateActiveAssessment(session.id);
    const command = {
      userSessionId: session.id,
      assessmentId: assessment.id,
      stepKey: "gender",
      payload: { gender: "female" },
      expectedVersion: 0,
      idempotencyKey: "retry-key-000001",
    };

    const first = await services.saveAssessmentStep(command);
    const replay = await services.saveAssessmentStep(command);
    expect(replay.version).toBe(first.version);
    expect(
      await services.prisma.assessmentStepSubmission.count({
        where: { assessmentId: assessment.id },
      }),
    ).toBe(1);

    await expectApplicationError(
      services.saveAssessmentStep({
        ...command,
        payload: { gender: "male" },
      }),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("allows exactly one concurrent update for the same version", async () => {
    const session = await services.createAnonymousSession();
    const assessment = await services.getOrCreateActiveAssessment(session.id);

    const attempts = await Promise.allSettled([
      services.saveAssessmentStep({
        userSessionId: session.id,
        assessmentId: assessment.id,
        stepKey: "gender",
        payload: { gender: "female" },
        expectedVersion: 0,
        idempotencyKey: "concurrent-a-0001",
      }),
      services.saveAssessmentStep({
        userSessionId: session.id,
        assessmentId: assessment.id,
        stepKey: "gender",
        payload: { gender: "male" },
        expectedVersion: 0,
        idempotencyKey: "concurrent-b-0001",
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: { code: "VERSION_CONFLICT" },
    });
    expect(
      await services.prisma.assessmentStepSubmission.count({
        where: { assessmentId: assessment.id },
      }),
    ).toBe(1);
  });

  it("changes result access from preview to full after an idempotent payment", async () => {
    const session = await services.createAnonymousSession();
    let assessment = await services.getOrCreateActiveAssessment(session.id);
    const steps = [
      ["gender", { gender: "female" }],
      ["goal", { goal: "lose_weight" }],
      ["body_profile", { age: 32, heightCm: 165 }],
      ["weight_goal", { weightKg: 70, targetWeightKg: 60 }],
      ["activity", { activityLevel: "moderate" }],
    ] as const;

    for (const [index, [stepKey, payload]] of steps.entries()) {
      assessment = await services.saveAssessmentStep({
        userSessionId: session.id,
        assessmentId: assessment.id,
        stepKey,
        payload,
        expectedVersion: assessment.version,
        idempotencyKey: `full-flow-${index}-0001`,
      });
    }
    await services.completeAssessment(session.id, assessment.id, assessment.version);

    const preview = await services.getAssessmentResult(session.id, assessment.id);
    expect(preview.access).toBe("preview");
    if (preview.access !== "preview") {
      throw new Error("Expected a preview result before payment");
    }
    expect(preview).not.toHaveProperty("weeklyProjection");
    expect(preview).not.toHaveProperty("recommendedDailyCalories");
    expect(preview.lockedFields).toEqual(
      expect.arrayContaining(["weeklyProjection", "recommendedDailyCalories"]),
    );

    const payment = await services.activateMockSubscription(
      session.id,
      "payment-retry-0001",
      { planCode: "demo_monthly" },
    );
    const replay = await services.activateMockSubscription(
      session.id,
      "payment-retry-0001",
      { planCode: "demo_monthly" },
    );
    expect(payment.status).toBe("active");
    expect(replay.expiresAt).toBe(payment.expiresAt);
    expect(await services.prisma.paymentEvent.count()).toBe(1);

    const full = await services.getAssessmentResult(session.id, assessment.id);
    expect(full.access).toBe("full");
    expect(full).toHaveProperty("weeklyProjection");
    expect(full).toHaveProperty("recommendedDailyCalories");
  });
});
