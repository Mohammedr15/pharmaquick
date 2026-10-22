import { NextResponse } from "next/server";
import { queryPharmacies } from "@/lib/pharmacies";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { medicineName, userLat, userLng, radiusKm, requestId } = body;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        { success: false, message: "توكن البوت غير معرف" },
        { status: 500 }
      );
    }

    const targetPharmacies = queryPharmacies(
      Number(userLat),
      Number(userLng),
      Number(radiusKm)
    );

    if (targetPharmacies.length === 0) {
      return NextResponse.json({
        success: false,
        message: `لا توجد صيدليات مسجلة ضمن نطاق ${radiusKm} كم.`,
      });
    }

    if (redisUrl && redisToken) {
      const initialPayload = JSON.stringify({
        status: "pending",
        medicineName: medicineName || "",
      });

      await fetch(
        `${redisUrl}/set/${requestId}/${encodeURIComponent(initialPayload)}?EX=7200`,
        {
          headers: { Authorization: `Bearer ${redisToken}` },
        }
      );
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
                {
                  text: "✅ متوفر",
                  callback_data: `avail_${requestId}_${pharmacy.id}`,
                },
                {
                  text: "❌ غير متوفر",
                  callback_data: `unavail_${requestId}_${pharmacy.id}`,
                },
              ],
            ],
          },
        }),
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({
      success: true,
      count: targetPharmacies.length,
    });
  } catch (error: unknown) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      { success: false, message: "خطأ في الخادم" },
      { status: 500 }
    );
  }
}