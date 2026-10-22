// app/api/search/route.ts

import { NextResponse } from "next/server";
import { queryPharmacies } from "@/lib/pharmacies";

export async function POST(request: Request) {
  try {
    const { medicineName, userLat, userLng, radiusKm, requestId } = await request.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json({ success: false, message: "توكن البوت غير معرف" }, { status: 500 });
    }

    const targetPharmacies = queryPharmacies(userLat, userLng, radiusKm);

    if (targetPharmacies.length === 0) {
      return NextResponse.json({
        success: false,
        message: `لا توجد صيدليات مسجلة ضمن نطاق ${radiusKm} كم.`,
      });
    }

    const sendPromises = targetPharmacies.map((pharmacy) => {
      const messageText =
        `🔍 *استعلام جديد عن دواء*\n\n` +
        `💊 اسم الدواء: *${medicineName}*\n` +
        `📍 يبعد عنك: *${pharmacy.distance.toFixed(1)} كم*\n\n` +
        `هل الدواء متوفر لديك حالياً؟`;

      return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: pharmacy.chatId,
          text: messageText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                // 🟢 استخدام avail و unavail لمنع التضارب أثناء الـ split
                { text: "✅ متوفر", callback_data: `avail_${requestId}_${pharmacy.name}` },
                { text: "❌ غير متوفر", callback_data: `unavail_${requestId}_${pharmacy.name}` },
              ],
            ],
          },
        }),
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, count: targetPharmacies.length });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ success: false, message: "خطأ في السيرفر" }, { status: 500 });
  }
}