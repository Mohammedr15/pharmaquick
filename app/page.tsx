"use client";

import { useState } from "react";

export default function SearchComponent() {
  const [medicineName, setMedicineName] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const handleSearch = async (e?: React.FormEvent) => {
    // 1️⃣ إيقاف السلوك الافتراضي للمتصفح (إعادة التحميل)
    if (e) e.preventDefault();

    if (!medicineName.trim()) {
      alert("يرجى كتابة اسم الدواء");
      return;
    }

    setLoading(true);
    setStatusMessage("جاري إرسال الطلب إلى الصيدليات القريبة...");

    try {
      const requestId = `REQ_${Date.now()}`;

      // 2️⃣ إرسال الطلب عبر مسار نسبي مباشر لتفادي مشاكل CORS
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          medicineName: medicineName,
          userLat: 30.9753, // إحداثيات عرعر الافتراضية
          userLng: 41.0381,
          radiusKm: 5000,   // نطاق واسع للاختبار
          requestId: requestId,
        }),
      });

      const data = await res.json();
      console.log("Search Response Data:", data);

      if (res.ok && data.success) {
        setStatusMessage(`✅ تم إرسال الطلب بنجاح إلى ${data.count} صيدلية!`);
      } else {
        setStatusMessage(`❌ فشل الطلب: ${data.message || "خطأ غير معروف"}`);
      }
    } catch (err: unknown) {
      console.error("Fetch Execution Error:", err);
      setStatusMessage("❌ حدث خطأ في الاتصال بالشبكة (تأكد من المتصفح)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4 text-right" dir="rtl">
      <form onSubmit={handleSearch} className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          اسم الدواء المطلوبة الاستعلام عنه:
        </label>
        <input
          type="text"
          value={medicineName}
          onChange={(e) => setMedicineName(e.target.value)}
          placeholder="مثال: بندول extra"
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "جاري البحث..." : "بحث عن الدواء"}
        </button>
      </form>

      {statusMessage && (
        <div className="p-3 bg-gray-100 rounded-md text-sm text-center font-medium text-gray-800">
          {statusMessage}
        </div>
      )}
    </div>
  );
}