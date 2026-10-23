import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import * as PharmaciesModule from "@/lib/pharmacies";

interface PharmacyItem {
  id?: string;
  name?: string;
  chat_id?: string | number;
  chatId?: string | number;
  lat?: number;
  latitude?: number;
  lng?: number;
  longitude?: number;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
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

    // 1️⃣ استدعاء دالة الاستعلام مع تمرير المعلمات
    let rawPharmacies: PharmacyItem[] = [];
    const queryFn = PharmaciesModule.queryPharmacies || (PharmaciesModule as any).default;

    if (typeof queryFn === "function") {
      try {
        const result = await (queryFn as Function)(userLat, userLng, radiusKm);
        rawPharmacies = Array.isArray(result) ? result : [];
      } catch (err) {
        console.warn("⚠️ تعذر استدعاء queryPharmacies بالمعلمات الثلاث، جاري استخراج البيانات المباشرة:", err);
      }
    }

    if (rawPharmacies.length === 0 && Array.isArray((PharmaciesModule as any).pharmacies)) {
      rawPharmacies = (PharmaciesModule as any).pharmacies;
    }

    // 2️⃣ فلترة الصيدليات بحسب النطاق الجغرافي والـ chat_id
    const targetPharmacies = rawPharmacies.filter((pharmacy: PharmacyItem) => {
      const chatId = pharmacy.chat_id || pharmacy.chatId;
      const lat = pharmacy.lat || pharmacy.latitude;
      const lng = pharmacy.lng || pharmacy.longitude;

      if (!chatId || lat === undefined || lng === undefined) return false;
      const distance = calculateDistance(userLat, userLng, Number(lat), Number(lng));
      return distance <= radiusKm;
    });

    const activePharmacies: PharmacyItem[] =
      targetPharmacies.length > 0 ? targetPharmacies : rawPharmacies;

    if (activePharmacies.length === 0) {
      return NextResponse.json(
        { success: false, message: "لا توجد صيدليات مسجلة تحتوي على chat_id صحيح" },
        { status: 404 }
      );
    }

    // 3️⃣ إعداد حالة الطلب الابتدائية في Upstash Redis
    const redisKey = `req:${requestId}`;
    await redis.set(
      redisKey,
      JSON.stringify({ status: "pending", medicineName }),
      { ex: 300 }
    );

    // 4️⃣ النص المختصر المطلوب
    const messageText =
      `السلام عليكم ,, \n` +
      `ممكن اسأل عن توفر (${medicineName})\n` +
      `شكرا`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✅ متوفر", callback_data: `avail:${requestId}` },
          { text: "❌ غير متوفر", callback_data: `unavail:${requestId}` },
        ],
      ],
    };

    // 5️⃣ إرسال الرسالة لجميع الصيدليات النشطة
    let successCount = 0;
    const sendPromises = activePharmacies.map(async (pharmacy: PharmacyItem) => {
      const chatId = pharmacy.chat_id || pharmacy.chatId;
      if (!chatId) return;

      try {
        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(chatId),
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
          console.error(`❌ فشل الإرسال للصيدلية (${pharmacy.name || chatId}):`, data);
        }
      } catch (err) {
        console.error(`❌ خطأ في الاتصال بالصيدلية (${pharmacy.name || chatId}):`, err);
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
      { success: false, message: "  الخدمة غير مفعلة حاليا بمنطقتك    " },
      { status: 500 }
    );
  }
}