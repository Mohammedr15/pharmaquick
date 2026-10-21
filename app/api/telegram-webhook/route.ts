import { NextResponse } from "next/server";

// استخدام كائن عالمي موحد للذاكرة لا يضيع مع إعادة التحميل المؤقت
if (!(global as any).pharmacyResponses) {
  (global as any).pharmacyResponses = {};
}
const globalStore = (global as any).pharmacyResponses;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.callback_query) {
      const callback = body.callback_query;
      const data = callback.data; // المار مثل: avail_yes_1 أو avail_no_1

      const [action, status, pharmacyId] = data.split("_");

      if (action === "avail" && pharmacyId) {
        // تخزين رد الصيدلية بالـ ID الخاص بها
        globalStore[pharmacyId] = {
          status: status === "yes" ? "AVAILABLE" : "UNAVAILABLE",
          updatedAt: Date.now(),
        };

        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        // إشعار الصيدلي في تليجرام باستلام الرد
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callback.id,
            text: status === "yes" ? "✅ تم تأكيد توفر الدواء" : "❌ تم تسجيل عدم توفر الدواء",
          }),
        });

        // تعديل نص الرسالة في تليجرام
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: callback.message.chat.id,
            message_id: callback.message.message_id,
            text: `${callback.message.text}\n\n📌 *الرد الحالي:* ${status === "yes" ? "✅ متوفر" : "❌ غير متوفر"}`,
            parse_mode: "Markdown",
          }),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}