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
      console.error("Redis environment variables missing!");
      return NextResponse.json({ status: "pending", error: "Redis env missing" });
    }

    // قراءة مباشرة مع إلغاء الـ Cache كلياً
    const res = await fetch(`${redisUrl}/get/${id}`, {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
      cache: "no-store",
    });

    const data = await res.json();

    if (data.result) {
      const parsedData = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      return NextResponse.json(parsedData);
    }

    return NextResponse.json({ status: "pending" });
  } catch (error) {
    console.error("Check status error:", error);
    return NextResponse.json({ status: "pending" });
  }
}