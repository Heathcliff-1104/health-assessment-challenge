import type { NextRequest } from "next/server";
import { handleMockPayment } from "@/presentation/api/payment-route";

export async function POST(request: NextRequest) {
  return handleMockPayment(request);
}
