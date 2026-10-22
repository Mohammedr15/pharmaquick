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
      console.error("❌ [DEBUG Check-Status] متغيرات Upstash Redis مفقودة!");
      return NextResponse.json({ status: "pending" });
    }

    const res = await fetch(`${redisUrl}/get/${id}`, {
      headers: { Authorization: `Bearer ${redisToken}` },
      cache: "no-store",
    });

    const data = await res.json();
    console.log(`🔎 [DEBUG Check-Status] البيانات المسترجعة من Redis لـ (${id}):`, data);

    if (data && data.result) {
      let parsed = data.result;

      // فك التغليف المزدوج لـ JSON إن وجد
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
          if (typeof parsed === "string") {
            parsed = JSON.parse(parsed);
          }
        } catch {
          // التعامل مع النصوص العادية
        }
      }

      if (parsed && typeof parsed === "object" && parsed.status) {
        console.log("✅ [DEBUG Check-Status] إعادة القيمة للفرونت إند:", parsed);
        return NextResponse.json(parsed);
      }
    }

    return NextResponse.json({ status: "pending" });
  } catch (error: unknown) {
    console.error("❌ [DEBUG Check-Status] خطأ:", error);
    return NextResponse.json({ status: "pending" });
  }
}