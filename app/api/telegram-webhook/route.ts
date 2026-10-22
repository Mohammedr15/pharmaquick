import { NextResponse } from "next/server";
import { PHARMACIES_DATABASE } from "@/lib/pharmacies";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body && body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = (callbackQuery.data as string) || "";
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      // 1. تفكيك البيانات: avail_REQ_123456_pharma1
      const parts = callbackData.split("_");
      const action = parts[0]; 
      
      // إعطاء أولوية لاستخراج رقم الطلب المبتدئ بـ REQ_
      let requestId = "";
      for (const part of parts) {
        if (part.startsWith("REQ")) {
          requestId = part;
          break;
        }
      }
      
      // إذا لم يجد بادئة REQ يأخذ العنصر الثاني تلقائياً
      if (!requestId && parts.length > 1) {
        requestId = parts[1];
      }

      const pharmacyId = parts[parts.length - 1];
      const isAvailable = action === "avail";
      const statusValue = isAvailable ? "available" : "unavailable";

      let pharmacyName = "صيدلية الدواء";
      if (pharmacyId) {
        const matched = PHARMACIES_DATABASE.find((p) => p.id === pharmacyId);
        if (matched) {
          pharmacyName = matched.name;
        }
      }

      // 2. الحفظ المباشر في Redis بأسلوب ينظف النصوص
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (redisUrl && redisToken && requestId) {
        const payloadData = {
          status: statusValue,
          pharmacyName: pharmacyName,
        };

        // إرسال Payload صريح لـ Upstash REST
        await fetch(`${redisUrl}/set/${requestId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redisToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(JSON.stringify(payloadData)),
        });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (botToken) {
        // إغلاق مؤشر التحميل والتعديل في التليجرام
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: isAvailable ? "تم تسجيل الرد: متوفر 🟢" : "تم تسجيل الرد: غير متوفر 🔴",
          }),
        });

        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `تم تسجيل ردك بنجاح:\nحالة الدواء: *${
              isAvailable ? "✅ متوفر" : "❌ غير متوفر"
            }*\nالصيدلية: *${pharmacyName}*`,
            parse_mode: "Markdown",
          }),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}