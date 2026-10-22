import { NextResponse } from "next/server";
import { PHARMACIES_DATABASE } from "@/lib/pharmacies";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("📩 [DEBUG Webhook] تم استقبال طلب من التليجرام:", JSON.stringify(body));

    if (body && body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = (callbackQuery.data as string) || "";
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      // تفكيك البيانات المدمجة بالفاصل |
      const parts = callbackData.split("|");
      const action = parts[0];
      const requestId = parts[1];
      const pharmacyId = parts[2];

      const isAvailable = action === "avail";
      const statusValue = isAvailable ? "available" : "unavailable";

      let pharmacyName = "صيدلية قريبة";
      if (pharmacyId) {
        const matched = PHARMACIES_DATABASE.find((p) => p.id === pharmacyId);
        if (matched) {
          pharmacyName = matched.name;
        }
      }

      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      // الحفظ الفوري المباشر لتحديث الحالة من pending إلى available/unavailable
      if (redisUrl && redisToken && requestId) {
        const payloadData = JSON.stringify({
          status: statusValue,
          pharmacyName: pharmacyName,
        });

        const saveRes = await fetch(
          `${redisUrl}/set/${requestId}/${encodeURIComponent(payloadData)}?EX=7200`,
          {
            headers: { Authorization: `Bearer ${redisToken}` },
          }
        );
        console.log("💾 [DEBUG Webhook] نتيجة الحفظ في Redis:", await saveRes.json());
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (botToken) {
        // إغلاق مؤشر التحميل في التليجرام
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
            text: isAvailable ? "تم تسجيل الرد: متوفر 🟢" : "تم تسجيل الرد: غير متوفر 🔴",
          }),
        });

        // تعديل نص الرسالة في التليجرام ليرى الصيدلي أنه رد
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
    console.error("❌ [DEBUG Webhook] خطأ:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}