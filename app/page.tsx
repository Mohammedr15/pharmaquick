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

  // سجل التتبع الحي لشاشة الجوال
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString("ar-SA");
    console.log(`[LOG ${time}] ${msg}`);
    setDebugLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // موقع العميل الجغرافي
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.9753,
    lng: 41.0381,
  });
  const [locationStatus, setLocationStatus] = useState("جاري جلب موقعك...");

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // 1️⃣ دالة جلب الموقع مع تسجيل خطوات التصحيح
  const requestLocation = useCallback(() => {
    addLog("🔍 بدء دالة طلب الموقع الجغرافي...");

    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      const err = "⚠️ البروتوكول ليس HTTPS (الموقع يحتاج اتصال آمن لتشغيل GPS)";
      setLocationStatus(err);
      addLog(err);
      return;
    }

    if ("geolocation" in navigator) {
      addLog("📡 المستشعر مدعوم، جاري طلب إحداثيات GPS...");
      setLocationStatus("📡 جاري الاتصال بمستشعر الـ GPS...");

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          setUserCoords({ lat, lng });
          const successMsg = `📍 تم التقاط الموقع: ${lat.toFixed(4)}, ${lng.toFixed(4)} (دقة: ${accuracy.toFixed(0)}m)`;
          setLocationStatus(successMsg);
          addLog(successMsg);

          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        },
        (error) => {
          const errCodeMap: Record<number, string> = {
            1: "تم رفض إذن الوصول للموقع (PERMISSION_DENIED)",
            2: "فشل تحديد الموقع الفعلي (POSITION_UNAVAILABLE)",
            3: "انتهت مهلة الانتظار لـ GPS الجوال (TIMEOUT)",
          };
          const errorText = errCodeMap[error.code] || error.message;
          addLog(`❌ خطأ GPS: ${errorText}`);

          addLog("🔄 محاولة جلب الموقع بالدقة التقريبية (Network/Cellular)...");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              const netMsg = "📍 تم تحديد الموقع عبر الشبكة (تقريبي)";
              setLocationStatus(netMsg);
              addLog(netMsg);
            },
            (netErr) => {
              const finalErr = `⚠️ تعذر الجلب التقريبي: ${netErr.message}`;
              setLocationStatus(finalErr);
              addLog(finalErr);
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }
      );
    } else {
      const noGeo = "⚠️ المتصفح لا يدعم Geolocation API";
      setLocationStatus(noGeo);
      addLog(noGeo);
    }
  }, []);

  useEffect(() => {
    requestLocation();
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [requestLocation]);

  // 2️⃣ دالة الاستعلام الدوري مع تسجيل كل استجابة
  const startPolling = (requestId: string) => {
    addLog(`🔄 بدء الـ Polling للطلب ID: ${requestId}`);

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const url = `/api/check-status?id=${requestId}&_t=${Date.now()}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });

        const data = await res.json();
        addLog(`📡 رد check-status: ${JSON.stringify(data)}`);

        if (data && data.status === "available") {
          addLog("🟢 تم اكتشاف حالة متوفر!");
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setLoading(false);
          setResultData({
            status: "available",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("🎉 اكتمل البحث!");
        } else if (data && data.status === "unavailable") {
          addLog("🔴 تم اكتشاف حالة غير متوفر!");
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setLoading(false);
          setResultData({
            status: "unavailable",
            pharmacyName: data.pharmacyName || "صيدلية قريبة",
          });
          setStatusMessage("❌ تم استلام الرد");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        addLog(`❌ خطأ أثناء الـ Polling: ${message}`);
      }
    }, 2500);

    setTimeout(() => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      setLoading((prev) => {
        if (prev) {
          addLog("⏰ انتهت مهلة الـ 120 ثانية دون تغيير الحالة من pending");
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
    addLog(`🚀 إرسال طلب الدواء: "${medicineName}" بالتركيب الجغرافي: ${userCoords.lat}, ${userCoords.lng}`);

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
      addLog(`📩 استجابة API Search: ${JSON.stringify(data)}`);

      if (res.ok && data.success) {
        setStatusMessage(`✅ تم إرسال الطلب إلى ${data.count} صيدلية قريبة! بانتظار الرد...`);
        startPolling(requestId);
      } else {
        setLoading(false);
        setStatusMessage(`⚠️ ${data.message || "لم يتم العثور على صيدليات مسجلة ضمن نطاق موقعك"}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`❌ خطأ في شبكة إرسال الطلب: ${message}`);
      setLoading(false);
      setStatusMessage("❌ حدث خطأ في الاتصال بالشبكة");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-4 text-gray-900" dir="rtl">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6 border border-slate-200 space-y-6">
        
        {/* العنوان */}
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

        {/* 🛠️ شاشة التتبع المباشر (Debug Console) للجوال */}
        <div className="mt-6 p-3 bg-slate-900 text-green-400 rounded-xl text-xs font-mono dir-ltr text-left space-y-1 max-h-48 overflow-y-auto">
          <div className="text-slate-400 border-b border-slate-700 pb-1 mb-1 font-bold text-center dir-rtl">
            🛠️ شاشة تتبع الأخطاء الحية للجوال (Live Debug)
          </div>
          {debugLogs.length === 0 && <p className="text-slate-500 text-center">لا توجد سجلات بعد...</p>}
          {debugLogs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap break-all border-b border-slate-800/50 pb-0.5">
              {log}
            </div>
          ))}
        </div>

      </div>
    </main>
  );
}