import { z } from "zod";

export const genderSchema = z.enum([
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
]);

export const goalSchema = z.enum([
  "lose_weight",
  "maintain_weight",
  "gain_weight",
]);

export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);

const ageSchema = z
  .number({ error: "Age must be a number" })
  .int("Age must be a whole number")
  .min(18, "This assessment is for adults aged 18 or over")
  .max(100, "Age must be 100 or under");

const heightSchema = z
  .number({ error: "Height must be a number" })
  .min(120, "Height must be at least 120 cm")
  .max(230, "Height must be at most 230 cm");

const weightSchema = z
  .number({ error: "Weight must be a number" })
  .min(35, "Weight must be at least 35 kg")
  .max(300, "Weight must be at most 300 kg");

export const stepSchemas = {
  gender: z.strictObject({ gender: genderSchema }),
  goal: z.strictObject({ goal: goalSchema }),
  body_profile: z.strictObject({
    age: ageSchema,
    heightCm: heightSchema,
  }),
  weight_goal: z.strictObject({
    weightKg: weightSchema,
    targetWeightKg: weightSchema,
  }),
  activity: z.strictObject({ activityLevel: activityLevelSchema }),
} as const;

export const weightTargetContextSchema = z
  .strictObject({
    goal: goalSchema,
    heightCm: heightSchema,
    weightKg: weightSchema,
    targetWeightKg: weightSchema,
  })
  .superRefine((value, context) => {
    const delta = value.targetWeightKg - value.weightKg;
    const targetBmi = value.targetWeightKg / (value.heightCm / 100) ** 2;

    if (value.goal === "lose_weight" && delta >= -0.1) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "A weight-loss target must be below the current weight",
      });
    }

    if (value.goal === "gain_weight" && delta <= 0.1) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "A weight-gain target must be above the current weight",
      });
    }

    if (value.goal === "maintain_weight" && Math.abs(delta) > 2) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "A maintenance target must stay within 2 kg of the current weight",
      });
    }

    if (Math.abs(delta) > value.weightKg * 0.5) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "The target cannot differ by more than 50% of current weight",
      });
    }

    if (targetBmi < 16 || targetBmi > 40) {
      context.addIssue({
        code: "custom",
        path: ["targetWeightKg"],
        message: "The target is outside the supported health-planning range",
      });
    }
  });

export const assessmentInputSchema = z
  .strictObject({
    gender: genderSchema,
    goal: goalSchema,
    age: ageSchema,
    heightCm: heightSchema,
    weightKg: weightSchema,
    targetWeightKg: weightSchema,
    activityLevel: activityLevelSchema,
  })
  .superRefine((value, context) => {
    const result = weightTargetContextSchema.safeParse({
      goal: value.goal,
      heightCm: value.heightCm,
      weightKg: value.weightKg,
      targetWeightKg: value.targetWeightKg,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

export type Gender = z.infer<typeof genderSchema>;
export type AssessmentGoal = z.infer<typeof goalSchema>;
export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export type StepKey = keyof typeof stepSchemas;
