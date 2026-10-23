"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export default function SearchPage() {
  const [medicineName, setMedicineName] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultData, setResultData] = useState<{
    status: string;
    pharmacyName?: string;
  } | null>(null);

  // موقع العميل الجغرافي (افتراضياً عرعر)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.9753,
    lng: 41.0381,
  });
  const [locationStatus, setLocationStatus] = useState("جاري جلب موقعك الجغرافي...");
  
  // مرجع لحفظ الـ Interval الخاص بالـ Polling لمنع التداخل
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1️⃣ دالة جلب الموقع الجغرافي المحسّنة للجوال (تمنع التعليق والرفض عند الـ Refresh)
  const requestLocation = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      setLocationStatus("⚠️ يجب فتح الموقع عبر رابط آمن (HTTPS) لتفعيل الـ GPS");
      return;
    }

    if ("geolocation" in navigator) {
      setLocationStatus("📡 جاري الاتصال بـ GPS الجوال...");

      const handleSuccess = (position: GeolocationPosition) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationStatus("📍 تم تحديد موقعك الجغرافي بنجاح");
      };

      const handleError = (error: GeolocationPositionError) => {
        console.warn("⚠️ محاولة جلب الموقع بالدقة العادية للجوال...", error);

        // المحاولة الثانية: إلغاء إجهاد المستشعر مع السماح باسترجاع كاش الموقع (maximumAge: 60000)
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (err) => {
            console.error("Geolocation fallback error:", err);
            setLocationStatus("📍 تم اعتماد الموقع الافتراضي (عرعر)");
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      };

      // المحاولة الأولى: السماح بذاكرة كاش للموقع مدتها 30 ثانية لتفادي رفض المتصفح عند الريفريش
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000, 
      });
    } else {
      setLocationStatus("⚠️ المتصفح لا يدعم تحديد الموقع التلقائي");
    }
  }, []);

  useEffect(() => {
    requestLocation();
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [requestLocation]);

  // 2️⃣ دالة الـ Polling المحسّنة بدون كاش لمتصفح الجوال
  const startPolling = (requestId: string) => {
    console.log("🔍 [DEBUG Frontend] بدء استعلام Polling للجوال لـ ID:", requestId);

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        // توليد رابط فريد تماماً لمنع متصفح الجوال من قراءة الكاش القديم
        const res = await fetch(`/api/check-status?id=${requestId}&_t=${Date.now()}`, {
          method: "GET",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });

        const data = await res.json();
        console.log("📡 [DEBUG Frontend] الرد من check-status:", data);

        if (data && data.status === "available") {
          console.log("🟢 [DEBUG Frontend] تم استلام حالة متوفر!");
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setLoading(false);
          setResultData({
            status: "available",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("🎉 اكتمل البحث!");
        } else if (data && data.status === "unavailable") {
          console.log("🔴 [DEBUG Frontend] تم استلام حالة غير متوفر!");
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setLoading(false);
          setResultData({
            status: "unavailable",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("❌ تم استلام الرد");
        } else {
          console.log("⏳ [DEBUG Frontend] بانتظار رد الصيدلي (pending)...");
        }
      } catch (err) {
        console.error("❌ [DEBUG Frontend] خطأ في جلب حالة الطلب:", err);
      }
    }, 2000);

    // مهلة إيقاف بعد دقيقتين
    setTimeout(() => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      setLoading((prevLoading) => {
        if (prevLoading) {
          setStatusMessage("⏰ انتهت مهلة الانتظار، لم ترد الصيدليات القريبة بعد");
          return false;
        }
        return false;
      });
    }, 120000);
  };

  // 3️⃣ إرسال الطلب
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
      console.log("🚀 [DEBUG Frontend] إرسال طلب جديد بـ ID:", requestId);

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName: medicineName,
          userLat: userCoords.lat,
          userLng: userCoords.lng,
          radiusKm: 50,
          requestId: requestId,
        }),
      });

      const data = await res.json();
      console.log("📩 [DEBUG Frontend] استجابة API البحث:", data);

      if (res.ok && data.success) {
        setStatusMessage(`✅ تم إرسال الطلب إلى ${data.count} صيدلية قريبة! بانتظار الرد...`);
        startPolling(requestId);
      } else {
        setLoading(false);
        setStatusMessage(`⚠️ ${data.message || "لم يتم العثور على صيدليات مسجلة ضمن نطاق موقعك"}`);
      }
    } catch (err) {
      console.error("❌ [DEBUG Frontend] خطأ في الاتصال بالشبكة:", err);
      setLoading(false);
      setStatusMessage("❌ حدث خطأ في الاتصال بالشبكة");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 text-gray-900" dir="rtl">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-6">
        
        {/* العناوين */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">PharmaQuick | فارما كويك</h1>
          <p className="text-sm font-semibold text-slate-700">البحث السريع عن الأدوية في الصيدليات القريبة</p>
          
          <div className="flex flex-col items-center gap-2">
            <span className="inline-block text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              {locationStatus}
            </span>
            <button
              type="button"
              onClick={requestLocation}
              className="text-xs font-bold text-blue-600 hover:underline focus:outline-none"
            >
              🔄 إعادة محاولة جلب الموقع
            </button>
          </div>
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

        {/* بطاقة النتيجة */}
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