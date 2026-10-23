import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { medicineName, userLat, userLng, requestId } = body;

    if (!medicineName || !requestId) {
      return NextResponse.json(
        { success: false, message: "اسم الدواء ورقم الطلب مطلوبان" },
        { status: 400 }
      );
    }

    // 1️⃣ إعداد حالة الطلب الابتدائية في Upstash Redis
    const redisKey = `req:${requestId}`;
    await redis.set(
      redisKey,
      JSON.stringify({ status: "pending", medicineName }),
      { ex: 300 }
    );

    // 2️⃣ تجهيز نص الرسالة وتنسيق الأزرار لتليجرام باستخدام HTML (أكثر آماناً واستقراراً من Markdown)
    const messageText = `💊 <b>طلب دواء جديد</b>\n\n` +
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

    // 3️⃣ إرسال الطلب إلى التليجرام
    const telegramRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageText,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        }),
      }
    );

    const telegramData = await telegramRes.json();

    if (!telegramRes.ok || !telegramData.ok) {
      console.error("❌ فشل إرسال الرسالة إلى التليجرام:", telegramData);
      return NextResponse.json(
        { 
          success: false, 
          message: `فشل إرسال الطلب للصيدليات: ${telegramData.description || "خطأ في الاتصال بالبوت"}` 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: 1,
      message: "تم إرسال الطلب بنجاح",
    });
  } catch (error) {
    console.error("❌ خطأ في api/search:", error);
    return NextResponse.json(
      { success: false, message: "خطأ داخلي في السيرفر" },
      { status: 500 }
    );
  }
}