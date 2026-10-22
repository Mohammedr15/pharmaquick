import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.callback_query) {
      const callbackData = body.callback_query.data as string;
      const chatId = body.callback_query.message.chat.id;
      const messageId = body.callback_query.message.message_id;

      // 1. تفكيك بيانات الزر بحذر
      const parts = callbackData.split("_");
      const action = parts[0]; // avail أو unavail
      const requestId = parts[1];
      const pharmacyName = parts.slice(2).join("_") || "الصيدلية";

      const isAvailable = action === "avail";
      const statusValue = isAvailable ? "available" : "unavailable";

      // 2. الحفظ المباشر في Upstash Redis باستخدام REST API لضمان عدم الضياع
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (redisUrl && redisToken) {
        const payload = JSON.stringify({
          status: statusValue,
          pharmacyName: pharmacyName,
        });

        // تخزين البيانات لمدة 7200 ثانية (ساعتين)
        await fetch(`${redisUrl}/set/${requestId}/${encodeURIComponent(payload)}?EX=7200`, {
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // 3. إجابة زر التليجرام (إلغاء التحميل)
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: body.callback_query.id,
          text: isAvailable ? "تم تسجيل الرد: متوفر 🟢" : "تم تسجيل الرد: غير متوفر 🔴",
        }),
      });

      // 4. تعديل النص داخل التليجرام
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