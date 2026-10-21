"use client";

import { useState, useEffect } from "react";
import { Search, Pill, MapPin, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function HomePage() {
  const [medicineName, setMedicineName] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedPharmacies, setSearchedPharmacies] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, { status: string }>>({});
  const [searchDone, setSearchDone] = useState(false);

  // فحص الردود القادمة من تليجرام كل 3 ثوانٍ
  useEffect(() => {
    if (!searchDone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/check-responses");
        const data = await res.json();
        if (data.responses) {
          setResponses(data.responses);
        }
      } catch (err) {
        console.error("خطأ أثناء استعلام الردود:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [searchDone]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medicineName.trim()) return;

    setLoading(true);
    setSearchDone(false);

    try {
      const res = await fetch("/api/query-pharmacies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName,
          userLat: 30.9753, // إحداثيات عرعر الافتراضية
          userLng: 41.0381,
          maxDistanceKm: 15,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSearchedPharmacies(data.pharmacies || []);
        setSearchDone(true);
      }
    } catch (err) {
      console.error("خطأ في الاتصال بالخادم:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 dir-rtl" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="text-center space-y-2 py-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            <Pill className="w-4 h-4" />
            <span>فارما كويك - PharmaQuick</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            البحث عن توفر الدواء في صيدليات عرعر
          </h1>
          <p className="text-slate-400 text-sm">
            أدخل اسم الدواء وسيتم استعلام الصيدليات القريبة منك عبر التليجرام مباشرة
          </p>
        </header>

        {/* Search Box */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={medicineName}
              onChange={(e) => setMedicineName(e.target.value)}
              placeholder="اكتب اسم الدواء (مثال: بنادول، أوجمنتين...)"
              className="w-full pr-10 pl-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !medicineName.trim()}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-medium rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "بحث"}
          </button>
        </form>

        {/* Results List */}
        {searchDone && (
          <div className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-slate-200">
              الصيدليات المستعلمة ({searchedPharmacies.length})
            </h2>

            {searchedPharmacies.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-xl text-slate-400">
                لم يتم العثور على صيدليات قريبة ضمن النطاق المطلوب.
              </div>
            ) : (
              searchedPharmacies.map((pharmacy) => {
                const response = responses[pharmacy.id];
                const status = response ? response.status : "PENDING";

                return (
                  <div
                    key={pharmacy.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h3 className="font-bold text-white">{pharmacy.nameAr}</h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{pharmacy.address || "عرعر"}</span>
                        <span>•</span>
                        <span>{pharmacy.distance} كم</span>
                      </div>
                    </div>

                    <div>
                      {status === "PENDING" && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium animate-pulse">
                          <Clock className="w-3.5 h-3.5" />
                          <span>بانتظار رد الصيدلي...</span>
                        </div>
                      )}

                      {status === "AVAILABLE" && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>متوفر ✅</span>
                        </div>
                      )}

                      {status === "UNAVAILABLE" && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>غير متوفر ❌</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </main>
  );
}