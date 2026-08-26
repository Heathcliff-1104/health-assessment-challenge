export type ApplicationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_INVALID"
  | "RESOURCE_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "STEP_OUT_OF_ORDER"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "ASSESSMENT_ALREADY_COMPLETED"
  | "ASSESSMENT_INCOMPLETE";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
