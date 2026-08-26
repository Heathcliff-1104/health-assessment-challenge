import { ApplicationError } from "@/application/errors";

export function parseExpectedVersion(value: string | null): number {
  if (!value) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "If-Match is required for concurrency control",
      422,
    );
  }
  const normalized = value.replace(/^W\//, "").replaceAll('"', "");
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 0) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "If-Match must contain a non-negative assessment version",
      422,
    );
  }
  return version;
}

export function requireIdempotencyKey(value: string | null): string {
  if (!value) {
    throw new ApplicationError(
      "VALIDATION_ERROR",
      "Idempotency-Key is required",
      422,
    );
  }
  return value;
}
