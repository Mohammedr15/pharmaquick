// app/api/telegram-webhook/route.ts

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.callback_query) {
      const callbackData = body.callback_query.data as string; // مثال: avail_REQ123_صيدلية الدواء
      const chatId = body.callback_query.message.chat.id;
      const messageId = body.callback_query.message.message_id;

      // تقسيم البيانات بوضوح
      const parts = callbackData.split("_");
      const action = parts[0]; // avail أو unavail
      const requestId = parts[1];
      const pharmacyName = parts.slice(2).join("_") || "الصيدلية"; // لتجنب مشاكل الأسماء التي تحتوي على مسافات أو شرطات

      // 🎯 تحديد الحالة بدقة متناهية
      const isAvailable = action === "avail";
      const finalStatus = isAvailable ? "available" : "unavailable";

      // 1. حفظ الحالة في Redis
      await redis.set(
        requestId,
        JSON.stringify({
          status: finalStatus,
          pharmacyName: pharmacyName,
        }),
        { ex: 7200 }
      );

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // 2. إجابة زر التليجرام (Alert)
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: body.callback_query.id,
          text: isAvailable ? "تم تسجيل الرد: متوفر 🟢" : "تم تسجيل الرد: غير متوفر 🔴",
        }),
      });

      // 3. تعديل نص الرسالة في التليجرام
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
    console.error("Webhook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}