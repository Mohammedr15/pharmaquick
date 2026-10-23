import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: true,
      }),
    });
  } catch (err) {
    console.error("❌ خطأ في answerCallbackQuery:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = callbackQuery.data; // النمط: "avail:REQ_123" أو "unavail:REQ_123"
      const pharmacyName = callbackQuery.from?.first_name || "صيدلية قريبة";

      if (callbackData && callbackData.includes(":")) {
        const [action, requestId] = callbackData.split(":");
        
        // تحويل الاختصار إلى الحالة المعيارية
        const status = action === "avail" ? "available" : action === "unavail" ? "unavailable" : null;

        if (requestId && status) {
          const statusLabel = status === "available" ? "متوفر 🎉" : "غير متوفر ❌";

          // 1️⃣ إجابة زر التليجرام فوراً بإشعار على الشاشة
          await answerCallbackQuery(callbackQuery.id, `تم تسجيل الرد: ${statusLabel}`);

          // 2️⃣ تحديث الحالة في Redis بنفس المفتاح المطلوب في الجوال
          const redisKey = `req:${requestId}`;
          await redis.set(
            redisKey,
            JSON.stringify({
              status: status,
              pharmacyName: pharmacyName,
              updatedAt: Date.now(),
            }),
            { ex: 300 }
          );

          return NextResponse.json({ success: true });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ خطأ في Webhook:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}