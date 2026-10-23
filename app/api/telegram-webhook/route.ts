import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// تهيئة عميل Upstash Redis باستخدام متغيرات البيئة
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// دالة مساعدة لإرسال تعديل أو رد على التليجرام
async function sendTelegramMessage(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
      }),
    });
  } catch (err) {
    console.error("❌ خطأ في إرسال رسالة التليجرام:", err);
  }
}

// دالة للإجابة على Callback Query لإخفاء مؤشر التحميل في التليجرام
async function answerCallbackQuery(callbackQueryId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false,
      }),
    });
  } catch (err) {
    console.error("❌ خطأ في إجابة CallbackQuery:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1️⃣ معالجة ضغطات الأزرار من التليجرام (Inline Keyboard Callbacks)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = callbackQuery.data; // النمط: "available:REQ_12345" أو "unavailable:REQ_12345"
      const chatId = callbackQuery.message?.chat?.id;
      const pharmacyName = callbackQuery.from?.first_name || "صيدلية قريبة";

      if (callbackData && callbackData.includes(":")) {
        const [status, requestId] = callbackData.split(":");

        if (requestId && (status === "available" || status === "unavailable")) {
          // حفظ الحالة في Upstash Redis بمفتاح موحد لمدة 5 دقائق (300 ثانية)
          const redisKey = `req:${requestId}`;
          const payload = {
            status: status,
            pharmacyName: pharmacyName,
            updatedAt: Date.now(),
          };

          await redis.set(redisKey, JSON.stringify(payload), { ex: 300 });

          // إشعار الصيدلي في التليجرام بتأكيد تسجيل الرد
          const statusText = status === "available" ? "🎉 متوفر" : "❌ غير متوفر";
          await answerCallbackQuery(
            callbackQuery.id,
            `تم تسجيل الرد: ${statusText}`
          );

          if (chatId) {
            await sendTelegramMessage(
              chatId,
              `✅ تم تحديث حالة الطلب (${requestId}) بنجاح إلى: ${statusText}`
            );
          }

          return NextResponse.json({ success: true, message: "State updated successfully" });
        }
      }
    }

    return NextResponse.json({ success: true, message: "Event ignored" });
  } catch (error) {
    console.error("❌ خطأ في استقبال Telegram Webhook:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}