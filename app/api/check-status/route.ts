import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestId = searchParams.get("id");

    if (!requestId) {
      return NextResponse.json(
        { status: "error", message: "Missing request ID" },
        { status: 400 }
      );
    }

    // قراءة البيانات من Redis
    const redisKey = `req:${requestId}`;
    const data = await redis.get(redisKey);

    // إضافة رؤوس حظر الكاش تماماً لتجاوز ذاكرة الجوال
    const headers = {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    if (!data) {
      return NextResponse.json({ status: "pending" }, { headers });
    }

    const parsedData = typeof data === "string" ? JSON.parse(data) : data;

    return NextResponse.json(
      {
        status: parsedData.status || "pending",
        pharmacyName: parsedData.pharmacyName || "صيدلية قريبة",
      },
      { headers }
    );
  } catch (error) {
    console.error("❌ خطأ في check-status API:", error);
    return NextResponse.json(
      { status: "error", message: "Internal Server Error" },
      { status: 500 }
    );
  }
}