// app/api/check-status/route.ts

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ status: "pending" });
  }

  try {
    // 1️⃣ الاستعلام المباشر عن مفتاح الطلب من Redis
    const data = await redis.get(id);

    if (!data) {
      return NextResponse.json({ status: "pending" });
    }

    // تجنيب أخطاء تحويل النص
    const result = typeof data === "string" ? JSON.parse(data) : data;
    return NextResponse.json(result);
  } catch (error) {
    console.error("Check status Redis Error:", error);
    return NextResponse.json({ status: "pending" });
  }
}