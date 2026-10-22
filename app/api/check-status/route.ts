import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ status: "pending" });
  }

  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      return NextResponse.json({ status: "pending" });
    }

    const res = await fetch(`${redisUrl}/get/${id}`, {
      headers: { Authorization: `Bearer ${redisToken}` },
      cache: "no-store",
    });

    const data = await res.json();

    if (data && data.result) {
      let parsed = data.result;

      // فك التغليف المزدوج لـ JSON
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
          if (typeof parsed === "string") {
            parsed = JSON.parse(parsed);
          }
        } catch {
          // في حال النص العادي
        }
      }

      if (parsed && typeof parsed === "object" && parsed.status) {
        return NextResponse.json(parsed);
      }
    }

    return NextResponse.json({ status: "pending" });
  } catch (error: unknown) {
    console.error("Check status error:", error);
    return NextResponse.json({ status: "pending" });
  }
}