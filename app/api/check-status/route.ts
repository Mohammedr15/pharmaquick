import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ status: "pending", error: "Missing ID" });
  }

  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      return NextResponse.json({ status: "pending", error: "Redis env missing" });
    }

    // قراءة مباشرة من Upstash بدون Caching
    const res = await fetch(`${redisUrl}/get/${id}`, {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
      cache: "no-store",
    });

    const data = await res.json();

    // فحص واستخراج النتيجة سواء كانت String أو Object
    if (data && data.result) {
      let rawResult = data.result;

      // إذا كانت القيمة مخزنة كـ JSON String داخل Redis
      if (typeof rawResult === "string") {
        try {
          rawResult = JSON.parse(rawResult);
        } catch {
          // في حال كانت نص عادي
        }
      }

      if (typeof rawResult === "object" && rawResult !== null) {
        return NextResponse.json(rawResult);
      }
    }

    return NextResponse.json({ status: "pending" });
  } catch (error) {
    console.error("Check status endpoint error:", error);
    return NextResponse.json({ status: "pending" });
  }
}