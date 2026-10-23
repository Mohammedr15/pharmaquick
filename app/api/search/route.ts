import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { pharmacies } from "@/lib/pharmacies";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// دالة حساب المسافة الجغرافية بالكيلومتر (Haversine Formula)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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
  return R * c;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { medicineName, userLat, userLng, radiusKm = 50, requestId } = body;

    if (!medicineName || !requestId) {
      return NextResponse.json(
        { success: false, message: "اسم الدواء ورقم الطلب مطلوبان" },
        { status: 400 }
      );
    }

    if (!TELEGRAM_BOT_TOKEN) {
      console.error("❌ TELEGRAM_BOT_TOKEN غير معرّف في Vercel Environment Variables");
      return NextResponse.json(
        { success: false, message: "خطأ في الخادم: توكن البوت غير معرّف" },
        { status: 500 }
      );
    }

    // 1️⃣ فلترة الصيدليات الموجودة في lib/pharmacies.ts حسب النطاق الجغرافي
    const targetPharmacies = pharmacies.filter((pharmacy) => {
      if (!pharmacy.chat_id || !pharmacy.lat || !pharmacy.lng) return false;
      const distance = calculateDistance(userLat, userLng, pharmacy.lat, pharmacy.lng);
      return distance <= radiusKm;
    });

    // في حال عدم وجود صيدليات ضمن النطاق، يتم إرسال الطلب لكافة الصيدليات المسجلة كبديل
    const activePharmacies = targetPharmacies.length > 0 ? targetPharmacies : pharmacies;

    if (activePharmacies.length === 0) {
      return NextResponse.json(
        { success: false, message: "لا توجد صيدليات مسجلة تحتوي على chat_id صحيح" },
        { status: 404 }
      );
    }

    // 2️⃣ إعداد حالة الطلب الابتدائية في Upstash Redis
    const redisKey = `req:${requestId}`;
    await redis.set(
      redisKey,
      JSON.stringify({ status: "pending", medicineName }),
      { ex: 300 }
    );

    // 3️⃣ تجهيز نص الرسالة بتنسيق HTML
    const messageText =
      `💊 <b>طلب دواء جديد</b>\n\n` +
      `📦 <b>الدواء:</b> ${medicineName}\n` +
      `🆔 <b>رقم الطلب:</b> <code>${requestId}</code>\n` +
      `📍 <b>الموقع:</b> <a href="https://www.google.com/maps?q=${userLat},${userLng}">عرض موقع العميل على الخريطة</a>`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ متوفر", callback_data: `avail:${requestId}` },
          { text: "❌ غير متوفر", callback_data: `unavail:${requestId}` },
        ],
      ],
    };

    // 4️⃣ إرسال الرسالة إلى الصيدليات المحددة عبر chat_id الخاص بكل منها
    let successCount = 0;
    const sendPromises = activePharmacies.map(async (pharmacy) => {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: pharmacy.chat_id,
              text: messageText,
              parse_mode: "HTML",
              reply_markup: replyMarkup,
            }),
          }
        );
        const data = await res.json();
        if (res.ok && data.ok) {
          successCount++;
        } else {
          console.error(`❌ فشل الإرسال للصيدلية (${pharmacy.name}):`, data);
        }
      } catch (err) {
        console.error(`❌ خطأ في الاتصال بالصيدلية (${pharmacy.name}):`, err);
      }
    });

    await Promise.all(sendPromises);

    if (successCount === 0) {
      return NextResponse.json(
        { success: false, message: "فشل إرسال الطلب إلى الصيدليات المسجلة" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: successCount,
      message: `تم إرسال الطلب إلى ${successCount} صيدلية بنجاح`,
    });
  } catch (error) {
    console.error("❌ خطأ في api/search:", error);
    return NextResponse.json(
      { success: false, message: "خطأ داخلي في الخادم" },
      { status: 500 }
    );
  }
}