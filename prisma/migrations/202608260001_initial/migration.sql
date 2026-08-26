-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "AssessmentGoal" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_WEIGHT');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StepKey" AS ENUM ('GENDER', 'GOAL', 'BODY_PROFILE', 'WEIGHT_GOAL', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "session_token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "user_session_id" UUID NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "current_step" "StepKey",
    "version" INTEGER NOT NULL DEFAULT 0,
    "gender" "Gender",
    "goal" "AssessmentGoal",
    "age" SMALLINT,
    "height_cm" DECIMAL(5,2),
    "weight_kg" DECIMAL(6,2),
    "target_weight_kg" DECIMAL(6,2),
    "activity_level" "ActivityLevel",
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_step_submissions" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "step_key" "StepKey" NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "assessment_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_step_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "bmi" DECIMAL(4,1) NOT NULL,
    "bmi_category" VARCHAR(32) NOT NULL,
    "basal_metabolic_rate" INTEGER NOT NULL,
    "total_daily_energy" INTEGER NOT NULL,
    "recommended_daily_calories" INTEGER NOT NULL,
    "predicted_target_date" DATE NOT NULL,
    "weekly_projection" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_session_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "plan_code" VARCHAR(64),
    "started_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "user_session_id" UUID NOT NULL,
    "external_event_id" VARCHAR(128) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_token_hash_key" ON "user_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "assessments_user_session_id_status_updated_at_idx" ON "assessments"("user_session_id", "status", "updated_at");

-- PostgreSQL partial uniqueness guarantees one resumable assessment per session.
CREATE UNIQUE INDEX "assessments_one_in_progress_per_session_idx" ON "assessments"("user_session_id") WHERE "status" = 'IN_PROGRESS';

-- CreateIndex
CREATE INDEX "assessment_step_submissions_assessment_id_step_key_created__idx" ON "assessment_step_submissions"("assessment_id", "step_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_step_submissions_assessment_id_idempotency_key_key" ON "assessment_step_submissions"("assessment_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_assessment_id_key" ON "assessment_results"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_session_id_key" ON "subscriptions"("user_session_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_expires_at_idx" ON "subscriptions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_external_event_id_key" ON "payment_events"("external_event_id");

-- CreateIndex
CREATE INDEX "payment_events_user_session_id_processed_at_idx" ON "payment_events"("user_session_id", "processed_at");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_session_id_fkey" FOREIGN KEY ("user_session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_step_submissions" ADD CONSTRAINT "assessment_step_submissions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_session_id_fkey" FOREIGN KEY ("user_session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_session_id_fkey" FOREIGN KEY ("user_session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-level guards complement API validation and protect direct writes.
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_version_nonnegative_check" CHECK ("version" >= 0);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_age_range_check" CHECK ("age" IS NULL OR "age" BETWEEN 18 AND 100);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_height_range_check" CHECK ("height_cm" IS NULL OR "height_cm" BETWEEN 120 AND 230);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_weight_range_check" CHECK ("weight_kg" IS NULL OR "weight_kg" BETWEEN 35 AND 300);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_target_weight_range_check" CHECK ("target_weight_kg" IS NULL OR "target_weight_kg" BETWEEN 35 AND 300);
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_bmi_positive_check" CHECK ("bmi" > 0);
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_calories_positive_check" CHECK ("recommended_daily_calories" > 0);
