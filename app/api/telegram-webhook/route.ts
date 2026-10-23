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
      const incomingChatId = String(callbackQuery.message?.chat?.id || "").trim();

      // 1️⃣ استخراج كافة الصيدليات من الملف بأي طريقة مدمجة
      let rawPharmacies: any[] = [];
      
      if (Array.isArray((PharmaciesModule as any).pharmacies)) {
        rawPharmacies = (PharmaciesModule as any).pharmacies;
      } else if (Array.isArray((PharmaciesModule as any).default)) {
        rawPharmacies = (PharmaciesModule as any).default;
      } else {
        const queryFn = PharmaciesModule.queryPharmacies || (PharmaciesModule as any).default;
        if (typeof queryFn === "function") {
          try {
            // استدعاء الدالة بطلب مفتوح أو بدون إحداثيات لجلب الجميع
            const result = await (queryFn as Function)(0, 0, 999999);
            rawPharmacies = Array.isArray(result) ? result : [];
          } catch (e) {
            console.warn("⚠️ تعذر استدعاء queryPharmacies جاري تجربة القراءات الأخرى");
          }
        }
      }

      // 2️⃣ البحث عن الصيدلية التي تطابق الـ chat_id تماماً
      const matchedPharmacy = rawPharmacies.find((p: any) => {
        const pChatId = String(p.chat_id || p.chatId || "").trim();
        return pChatId === incomingChatId && pChatId !== "";
      });

      // استخدام الاسم الفعلي من pharmacies.ts إذا وُجد
      const pharmacyName =
        matchedPharmacy?.name ||
        callbackQuery.from?.first_name ||
        "صيدلية قريبة";

      console.log(`🔍 Chat ID المستقبل: ${incomingChatId} | الاسم المستخرج: ${pharmacyName}`);

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

          await answerCallbackQuery(
            callbackQuery.id,
            `تم تسجيل الرد: ${statusLabel}`
          );

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