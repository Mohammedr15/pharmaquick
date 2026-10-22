import { NextResponse } from "next/server";
import { queryPharmacies } from "@/lib/pharmacies";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const medicineName = body.medicineName || body.medicine || "دواء غير محدد";
    const userLat = Number(body.userLat || body.lat || 30.9753);
    const userLng = Number(body.userLng || body.lng || 41.0381);
    const radiusKm = Number(body.radiusKm || body.radius || 5000);
    const requestId = body.requestId || `REQ_${Date.now()}`;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!botToken) {
      return NextResponse.json(
        { success: false, message: "توكن البوت غير معرف" },
        { status: 500 }
      );
    }

    const targetPharmacies = queryPharmacies(userLat, userLng, radiusKm);

    if (targetPharmacies.length === 0) {
      return NextResponse.json({
        success: false,
        message: "لا توجد صيدليات مسجلة ضمن النطاق المحدد.",
      });
    }

    // تعيين حالة الطلب المبدئية
    if (redisUrl && redisToken) {
      const initialPayload = JSON.stringify({
        status: "pending",
        medicineName: medicineName,
      });

      await fetch(
        `${redisUrl}/set/${requestId}/${encodeURIComponent(initialPayload)}?EX=7200`,
        {
          headers: { Authorization: `Bearer ${redisToken}` },
        }
      );
    }

    // إرسال الرسالة مع استخدام الفاصل | لمنع تشتت المعرف
    const sendPromises = targetPharmacies.map(async (pharmacy) => {
      const messageText =
        `🔍 *استعلام جديد عن دواء*\n\n` +
        `💊 اسم الدواء: *${medicineName}*\n` +
        `📍 المسافة: *${pharmacy.distance.toFixed(1)} كم*\n\n` +
        `هل الدواء متوفر لديك حالياً؟`;

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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
                  callback_data: `avail|${requestId}|${pharmacy.id}`,
                },
                {
                  text: "❌ غير متوفر",
                  callback_data: `unavail|${requestId}|${pharmacy.id}`,
                },
              ],
            ],
          },
        }),
      });

      return await res.json();
    });

    await Promise.all(sendPromises);

    return NextResponse.json({
      success: true,
      requestId: requestId,
      count: targetPharmacies.length,
    });
  } catch (error: unknown) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      { success: false, message: "حدث خطأ أثناء معالجة البحث" },
      { status: 500 }
    );
  }
}