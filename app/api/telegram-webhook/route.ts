// app/api/telegram-webhook/route.ts

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// الاتصال المباشر بقاعدة بيانات Redis باستخدام متغيرات البيئة
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.callback_query) {
      const callbackData = body.callback_query.data; // available_REQ123_PharmaName
      const chatId = body.callback_query.message.chat.id;
      const messageId = body.callback_query.message.message_id;

      const [action, requestId, pharmacyName] = callbackData.split("_");
      const isAvailable = action === "available";

      // 1️⃣ حفظ حالة الطلب فوراً في Redis مع تعيين وقت انتهاء الصلاحية (Expiration: 2 hours)
      await redis.set(
        requestId,
        JSON.stringify({
          status: isAvailable ? "available" : "unavailable",
          pharmacyName: pharmacyName || "الصيدلية",
        }),
        { ex: 7200 }
      );

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // 2️⃣ إجابة زر التليجرام
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: body.callback_query.id,
          text: isAvailable ? "تم تسجيل الرد: متوفر 🟢" : "تم تسجيل الرد: غير متوفر 🔴",
        }),
      });

      // 3️⃣ تحديث نص الرسالة في التليجرام
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: `تم تسجيل ردك بنجاح:\nحالة الدواء: *${isAvailable ? "✅ متوفر" : "❌ غير متوفر"}*`,
          parse_mode: "Markdown",
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook Redis Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}