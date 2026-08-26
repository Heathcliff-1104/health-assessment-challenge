import type {
  ActivityLevel,
  AssessmentInput,
  Gender,
} from "./assessment-input";

export const ALGORITHM_VERSION = "health-v1";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GENDER_OFFSETS: Record<Gender, number> = {
  male: 5,
  female: -161,
  non_binary: -78,
  prefer_not_to_say: -78,
};

const CALORIE_FLOORS: Record<Gender, number> = {
  male: 1500,
  female: 1200,
  non_binary: 1300,
  prefer_not_to_say: 1300,
};

export type BmiCategory =
  | "underweight"
  | "healthy_range"
  | "overweight"
  | "obesity_range";

export interface ProjectionPoint {
  week: number;
  date: string;
  weightKg: number;
}

export interface HealthAssessmentResult {
  algorithmVersion: typeof ALGORITHM_VERSION;
  bmi: number;
  bmiCategory: BmiCategory;
  basalMetabolicRate: number;
  totalDailyEnergy: number;
  recommendedDailyCalories: number;
  predictedTargetDate: string;
  weeklyProjection: ProjectionPoint[];
}

export interface AssessmentClock {
  now(): Date;
}

const systemClock: AssessmentClock = { now: () => new Date() };

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function classifyBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy_range";
  if (bmi < 30) return "overweight";
  return "obesity_range";
}

export function calculateHealthAssessment(
  input: AssessmentInput,
  clock: AssessmentClock = systemClock,
): HealthAssessmentResult {
  const heightMeters = input.heightCm / 100;
  const bmi = round(input.weightKg / heightMeters ** 2, 1);
  const rawBmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    GENDER_OFFSETS[input.gender];
  const basalMetabolicRate = Math.round(rawBmr);
  const totalDailyEnergy = Math.round(
    rawBmr * ACTIVITY_MULTIPLIERS[input.activityLevel],
  );

  const calorieAdjustment =
    input.goal === "lose_weight" ? -500 : input.goal === "gain_weight" ? 300 : 0;
  const recommendedDailyCalories = Math.min(
    4500,
    Math.max(CALORIE_FLOORS[input.gender], totalDailyEnergy + calorieAdjustment),
  );

  const start = clock.now();
  const weightDelta = input.targetWeightKg - input.weightKg;
  const weeklyRate =
    input.goal === "lose_weight"
      ? Math.min(0.75, Math.max(0.25, input.weightKg * 0.005))
      : input.goal === "gain_weight"
        ? Math.min(0.5, Math.max(0.1, input.weightKg * 0.0025))
        : 0;
  const totalWeeks = weeklyRate === 0 ? 0 : Math.ceil(Math.abs(weightDelta) / weeklyRate);
  const direction = Math.sign(weightDelta);

  const weeklyProjection: ProjectionPoint[] = Array.from(
    { length: totalWeeks + 1 },
    (_, week) => {
      const projectedChange = Math.min(Math.abs(weightDelta), weeklyRate * week);
      return {
        week,
        date: toDateOnly(addUtcDays(start, week * 7)),
        weightKg: round(input.weightKg + direction * projectedChange, 1),
      };
    },
  );

  if (totalWeeks > 0) {
    weeklyProjection[weeklyProjection.length - 1].weightKg = round(
      input.targetWeightKg,
      1,
    );
  }

  return {
    algorithmVersion: ALGORITHM_VERSION,
    bmi,
    bmiCategory: classifyBmi(bmi),
    basalMetabolicRate,
    totalDailyEnergy,
    recommendedDailyCalories,
    predictedTargetDate: toDateOnly(addUtcDays(start, totalWeeks * 7)),
    weeklyProjection,
  };
}
