import { NextResponse } from "next/server";
import { PHARMACIES_DATABASE } from "../../../lib/pharmacies";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body && body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = (callbackQuery.data as string) || "";
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      const parts = callbackData.split("_");
      const action = parts[0];
      const requestId = parts[1];
      const pharmacyId = parts[2];

      const isAvailable = action === "avail";
      const statusValue = isAvailable ? "available" : "unavailable";

      const matchedPharmacy = PHARMACIES_DATABASE.find(
        (p) => p.id === pharmacyId
      );
      const pharmacyName = matchedPharmacy
        ? matchedPharmacy.name
        : "الصيدلية";

      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (redisUrl && redisToken && requestId) {
        const payload = JSON.stringify({
          status: statusValue,
          pharmacyName: pharmacyName,
        });

        await fetch(
          `${redisUrl}/set/${requestId}/${encodeURIComponent(payload)}?EX=7200`,
          {
            headers: { Authorization: `Bearer ${redisToken}` },
          }
        );
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (botToken) {
        await fetch(
          `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callbackQuery.id,
              text: isAvailable
                ? "تم تسجيل الرد: متوفر 🟢"
                : "تم تسجيل الرد: غير متوفر 🔴",
            }),
          }
        );

        await fetch(
          `https://api.telegram.org/bot${botToken}/editMessageText`,
          {
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
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}