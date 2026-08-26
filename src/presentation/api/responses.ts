import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ApplicationError } from "@/application/errors";

export function createRequestId(): string {
  return randomUUID();
}

export function successResponse(
  data: unknown,
  requestId: string,
  status = 200,
): NextResponse {
  return NextResponse.json(
    { data, meta: { requestId } },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export function errorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof ApplicationError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          requestId,
        },
      },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: {
          code: "MALFORMED_JSON",
          message: "The request body is not valid JSON",
          requestId,
        },
      },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  console.error("Unhandled API error", { requestId, error });
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
    },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
