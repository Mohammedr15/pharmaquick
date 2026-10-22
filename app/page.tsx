"use client";

import { useState, useEffect } from "react";

export default function SearchPage() {
  const [medicineName, setMedicineName] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultData, setResultData] = useState<{
    status: string;
    pharmacyName?: string;
  } | null>(null);

  // موقع المستخدم الجغرافي (افتراضياً عرعر/القصيم)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.9753,
    lng: 41.0381,
  });
  const [locationStatus, setLocationStatus] = useState("جاري تحديد موقعك...");

  // 1️⃣ جلب موقع المستخدم الجغرافي الحقيقي تلقائياً
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocationStatus("📍 تم تحديد موقعك الجغرافي بنجاح");
        },
        (error) => {
          console.warn("Geolocation Error:", error);
          setLocationStatus("⚠️ تعذر تحديد الموقع، تم استخدام الموقع الافتراضي");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationStatus("⚠️ المتصفح لا يدعم تحديد الموقع التلقائي");
    }
  }, []);

  // 2️⃣ بدء مراقبة تحديث الرد من Upstash Redis (Polling)
  const startPolling = (requestId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-status?id=${requestId}`, {
          cache: "no-store",
        });
        const data = await res.json();

        if (data.status === "available") {
          clearInterval(interval);
          setLoading(false);
          setResultData({
            status: "available",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("🎉 اكتمل البحث!");
        } else if (data.status === "unavailable") {
          clearInterval(interval);
          setLoading(false);
          setResultData({
            status: "unavailable",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("❌ تم استلام الرد");
        }
      } catch (err) {
        console.error("Polling Error:", err);
      }
    }, 2000); // يفحص السيرفر كل ثانيتين

    // إيقاف الفحص تلقائياً بعد دقيقتين في حال عدم رد أي صيدلية
    setTimeout(() => {
      clearInterval(interval);
      if (loading) {
        setLoading(false);
        setStatusMessage("⏰ انتهت مهلة الانتظار، لم ترد الصيدليات القريبة بعد");
      }
    }, 120000);
  };

  // 3️⃣ إرسال طلب البحث
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!medicineName.trim()) {
      alert("يرجى كتابة اسم الدواء أولاً");
      return;
    }

    setLoading(true);
    setResultData(null);
    setStatusMessage("📡 جاري إرسال الاستعلام للصيدليات القريبة من موقعك...");

    try {
      const requestId = `REQ_${Date.now()}`;

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName: medicineName,
          userLat: userCoords.lat,
          userLng: userCoords.lng,
          radiusKm: 50, // البحث ضمن نطاق 50 كم من موقع العميل
          requestId: requestId,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMessage(`✅ تم إرسال الطلب إلى ${data.count} صيدلية قريبة! بانتظار الرد...`);
        // بدء الـ Polling الفوري
        startPolling(requestId);
      } else {
        setLoading(false);
        setStatusMessage(`⚠️ ${data.message || "لم يتم العثور على صيدليات مسجلة ضمن نطاق موقعك"}`);
      }
    } catch (err) {
      console.error("Search Error:", err);
      setLoading(false);
      setStatusMessage("❌ حدث خطأ في الاتصال بالشبكة");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 text-gray-900" dir="rtl">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-6">
        
        {/* العناوين بنصوص واضحة وداكنة */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">PharmaQuick | فارما كويك</h1>
          <p className="text-sm font-semibold text-slate-700">البحث السريع عن الأدوية في الصيدليات القريبة</p>
          <span className="inline-block text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            {locationStatus}
          </span>
        </div>

        {/* نموذج البحث */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-900 mb-2">
              اسم الدواء المطلوب:
            </label>
            <input
              type="text"
              value={medicineName}
              onChange={(e) => setMedicineName(e.target.value)}
              placeholder="اكتب اسم الدواء (مثال: بندول extra)"
              className="w-full p-3 border-2 border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition duration-200 disabled:bg-slate-400 shadow-md text-base"
          >
            {loading ? "جاري البحث والتتبع..." : "🔍 بحث في الصيدليات القريبة"}
          </button>
        </form>

        {/* حالة الطلب */}
        {statusMessage && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm font-bold text-blue-900">
            {statusMessage}
          </div>
        )}

        {/* بطاقة النتيجة التفاعلية المباشرة */}
        {resultData && (
          <div
            className={`p-5 rounded-2xl border-2 text-center space-y-2 transition-all ${
              resultData.status === "available"
                ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                : "bg-rose-50 border-rose-500 text-rose-950"
            }`}
          >
            <h3 className="text-lg font-bold">
              {resultData.status === "available"
                ? "🎉 الدواء متوفر حالياً!"
                : "❌ الدواء غير متوفر"}
            </h3>
            <p className="text-sm font-semibold">
              الصيدلية: <span className="underline font-bold">{resultData.pharmacyName}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}