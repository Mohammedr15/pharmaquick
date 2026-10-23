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

  // موقع العميل الجغرافي (مثبت ومستقر)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.9753,
    lng: 41.0381,
  });
  const [locationStatus, setLocationStatus] = useState("جاري جلب موقعك الجغرافي...");

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // 1️⃣ إعدادات الـ GPS المثبتة (بدون أي تغيير)
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
      setLocationStatus("📡 جاري الاتصال بمستشعر الـ GPS...");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserCoords({ lat, lng });
          setLocationStatus("📍 تم تحديد موقعك الجغرافي بنجاح");
        },
        (error) => {
          console.warn("⚠️ فشل جلب الموقع عالي الدقة، جاري المحاولة بالدقة العادية...", error);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setLocationStatus("📍 تم تحديد موقعك (دقة تقريبية)");
            },
            () => {
              setLocationStatus("⚠️ تعذر تحديد موقع GPS دقيق، تم استخدام الموقع الافتراضي");
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        }
      );
    } else {
      setLocationStatus("⚠️ المتصفح لا يدعم تحديد الموقع التلقائي");
    }
  }, []);

  // 2️⃣ دالة فحص النتيجة المركزة للموبايل (ضد الكاش مع استجابة فورية)
  const checkStatusOnce = useCallback(async (requestId: string) => {
    try {
      // معلمة _t تضمن عدم استرجاع نتيجة قديمة من ذاكرة الجوال
      const res = await fetch(`/api/check-status?id=${requestId}&_t=${Date.now()}`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
        },
        cache: "no-store",
      });

      if (!res.ok) return false;

      const data = await res.json();

      if (data && data.status === "available") {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setLoading(false);
        setResultData({
          status: "available",
          pharmacyName: data.pharmacyName || "صيدلية قريبة",
        });
        setStatusMessage("🎉 اكتمل البحث!");
        return true;
      } else if (data && data.status === "unavailable") {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setLoading(false);
        setResultData({
          status: "unavailable",
          pharmacyName: data.pharmacyName || "صيدلية قريبة",
        });
        setStatusMessage("❌ تم استلام الرد");
        return true;
      }
    } catch (err) {
      console.error("❌ خطأ في جلب حالة الطلب على الجوال:", err);
    }
    return false;
  }, []);

  // 3️⃣ بدء الفحص الدوري (Polling)
  const startPolling = (requestId: string) => {
    activeRequestIdRef.current = requestId;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // فحص فوري أولاً
    checkStatusOnce(requestId);

    // ثم فحص كل ثانية والنصف لسرعة الملاحظة على الجوال
    pollingIntervalRef.current = setInterval(() => {
      checkStatusOnce(requestId);
    }, 1500);

    // إيقاف تلقائي بعد 120 ثانية
    setTimeout(() => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      setLoading((prev) => {
        if (prev) {
          setStatusMessage("⏰ انتهت مهلة الانتظار، لم ترد الصيدليات القريبة بعد");
          return false;
        }
        return false;
      });
    }, 120000);
  };

  // 4️⃣ الاستجابة الفورية عند العودة من تطبيق تلجرام إلى المتصفح
  useEffect(() => {
    requestLocation();

    const handleFocusOrVisible = () => {
      if (
        (document.visibilityState === "visible" || document.hasFocus()) &&
        activeRequestIdRef.current &&
        loading
      ) {
        // اجبار استعلام مباشر في نفس لحظة فتح الشاشة
        checkStatusOnce(activeRequestIdRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleFocusOrVisible);
    window.addEventListener("focus", handleFocusOrVisible);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      window.removeEventListener("focus", handleFocusOrVisible);
    };
  }, [requestLocation, checkStatusOnce, loading]);

  // 5️⃣ إرسال الطلب
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
          radiusKm: 50,
          requestId: requestId,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMessage(`✅ تم إرسال الطلب إلى ${data.count} صيدلية قريبة! بانتظار الرد...`);
        startPolling(requestId);
      } else {
        setLoading(false);
        setStatusMessage(`⚠️ ${data.message || "لم يتم العثور على صيدليات مسجلة ضمن نطاق موقعك"}`);
      }
    } catch (err) {
      console.error("❌ خطأ في الاتصال بالشبكة:", err);
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

        {/* بطاقة النتيجة (تظهر فوراً عند تغير الحالة) */}
        {resultData && (
          <div
            className={`p-5 rounded-2xl border-2 text-center space-y-2 transition-all shadow-md ${
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