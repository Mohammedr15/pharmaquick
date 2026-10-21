import { NextResponse } from "next/server";

export async function GET() {
  const responses = (global as any).pharmacyResponses || {};
  return NextResponse.json({ responses });
}