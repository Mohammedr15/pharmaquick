import { NextResponse } from "next/server";
import { pharmacies } from "@/lib/pharmacies";

// دالة حساب المسافة بالهافرساين (Haversine Formula) مبنية داخل الملف مباشرة لتجنب أخطاء الاستيراد
function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // نصف قطر الأرض بالكيلومتر
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // التقريب لمنزلة عشرية واحدة
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.medicineName) {
      return NextResponse.json(
        { success: false, error: "اسم الدواء مطلوب" },
        { status: 400 }
      );
    }

    const { medicineName, userLat, userLng, maxDistanceKm = 10 } = body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN غير معرف في ملف .env.local");
      return NextResponse.json(
        { success: false, error: "تعديل السيرفر: التوكن غير موجود" },
        { status: 500 }
      );
    }

    // إحداثيات افتراضية لعرعر في حال عدم سماح المستخدم بالموقع
    const currentLat = Number(userLat) || 30.9753;
    const currentLng = Number(userLng) || 41.0381;

    // تصفية الصيدليات وحساب المسافة
    const matchedPharmacies = pharmacies
      .map((pharmacy) => {
        const distance = getDistanceInKm(
          currentLat,
          currentLng,
          pharmacy.lat,
          pharmacy.lng
        );
        return { ...pharmacy, distance };
      })
      .filter((pharmacy) => pharmacy.distance <= maxDistanceKm);

    // تجهيز وتنظيف نص الدواء
    const cleanMedicineName = String(medicineName).replace(/[_*`[\]()]/g, " ");

    // إرسال الرسائل والأزرار التفاعلية إلى تليجرام
    const notifications = matchedPharmacies.map(async (pharmacy) => {
      if (!pharmacy.telegramChatId) return;

      const messageText = 
`🔔 *استعلام جديد عن دواء!*

💊 *اسم الدواء:* ${cleanMedicineName}
📍 *المسافة من موقع المريض:* ${pharmacy.distance} كم

يرجى تأكيد توفر الدواء بالضغط على أحد الأزرار أدناه:`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "✅ متوفر", callback_data: `avail_yes_${pharmacy.id}` },
            { text: "❌ غير متوفر", callback_data: `avail_no_${pharmacy.id}` }
          ],
          [
            { text: "📞 طلب التواصل مع المريض", callback_data: `contact_${pharmacy.id}` }
          ]
        ]
      };

      try {
        const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: pharmacy.telegramChatId,
            text: messageText,
            parse_mode: "Markdown",
            reply_markup: replyMarkup
          }),
        });

        const telegramData = await telegramRes.json();
        if (!telegramData.ok) {
          console.error(`Telegram API Error (${pharmacy.nameAr}):`, telegramData);
        }
      } catch (err) {
        console.error(`Network Error for ${pharmacy.nameAr}:`, err);
      }
    });

    await Promise.all(notifications);

    return NextResponse.json({
      success: true,
      count: matchedPharmacies.length,
      pharmacies: matchedPharmacies,
    });

  } catch (error) {
    console.error("API Router Error:", error);
    return NextResponse.json(
      { success: false, error: "حدث خطأ غير متوقع داخل السيرفر" },
      { status: 500 }
    );
  }
}