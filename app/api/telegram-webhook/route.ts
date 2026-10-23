import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import * as PharmaciesModule from "@/lib/pharmacies";

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
      const callbackData = callbackQuery.data; // "avail:REQ_123" أو "unavail:REQ_123"
      const chatId = callbackQuery.message?.chat?.id;
      
      // 1️⃣ البحث عن اسم الصيدلية من ملف pharmacies.ts المطابق لـ chat_id
      let pharmacyName = "";
      const queryFn = PharmaciesModule.queryPharmacies || (PharmaciesModule as any).default;
      let rawPharmacies: any[] = [];

      if (typeof queryFn === "function") {
        try {
          const result = await (queryFn as Function)();
          rawPharmacies = Array.isArray(result) ? result : [];
        } catch (e) {
          // تجاهل الخطأ في حال كانت الدالة تتطلب معلمات
        }
      }

      if (rawPharmacies.length === 0 && Array.isArray((PharmaciesModule as any).pharmacies)) {
        rawPharmacies = (PharmaciesModule as any).pharmacies;
      }

      const matchedPharmacy = rawPharmacies.find(
        (p) => String(p.chat_id || p.chatId) === String(chatId)
      );

      // استخدام اسم الصيدلية من الملف، أو الاسم من التليجرام كخيار بديل
      pharmacyName =
        matchedPharmacy?.name ||
        callbackQuery.from?.first_name ||
        "صيدلية قريبة";

      if (callbackData && callbackData.includes(":")) {
        const [action, requestId] = callbackData.split(":");
        const status =
          action === "avail"
            ? "available"
            : action === "unavail"
            ? "unavailable"
            : null;

        if (requestId && status) {
          const statusLabel = status === "available" ? "متوفر 🎉" : "غير متوفر ❌";

          // إجابة الـ Callback بملء الشاشة للتأكيد
          await answerCallbackQuery(
            callbackQuery.id,
            `تم تسجيل الرد: ${statusLabel}`
          );

          // حفظ البيانات في Redis مع الاسم المعتمد للصيدلية
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