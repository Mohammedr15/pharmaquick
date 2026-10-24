"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type LocationState =
  | "loading"
  | "precise"
  | "approx"
  | "failed"
  | "insecure"
  | "unsupported";

type Phase = "idle" | "sending" | "waiting" | "done" | "timeout" | "error";

type Result = {
  status: "available" | "unavailable";
  pharmacyName: string;
};

// Used only when GPS fails. The UI tells the user clearly when this happens.
const DEFAULT_COORDS = { lat: 30.9753, lng: 41.0381 };
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 60; // 2 minutes
const WAIT_SECONDS = (POLL_INTERVAL_MS * MAX_ATTEMPTS) / 1000;
const RECENT_KEY = "pharmaquick_recent";

const LOCATION_UI: Record<
  LocationState,
  { text: string; tone: "ok" | "warn" | "wait"; retry: boolean }
> = {
  loading: { text: "جاري تحديد موقعك...", tone: "wait", retry: false },
  precise: { text: "تم تحديد موقعك", tone: "ok", retry: false },
  approx: { text: "تم تحديد موقعك (بدقة تقريبية)", tone: "ok", retry: true },
  failed: {
    text: "تعذر تحديد موقعك، سيتم البحث في المنطقة الافتراضية",
    tone: "warn",
    retry: true,
  },
  insecure: {
    text: "افتح الموقع عبر رابط آمن (HTTPS) لتفعيل تحديد الموقع",
    tone: "warn",
    retry: false,
  },
  unsupported: {
    text: "المتصفح لا يدعم تحديد الموقع، سيتم البحث في المنطقة الافتراضية",
    tone: "warn",
    retry: false,
  },
};

const TONE_CLASSES = {
  ok: "bg-emerald-50 text-emerald-900 border-emerald-200",
  warn: "bg-amber-50 text-amber-900 border-amber-300",
  wait: "bg-slate-100 text-slate-700 border-slate-200",
};

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CapsuleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m10.5 20.5-7-7a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  );
}

export default function SearchPage() {
  const [medicineName, setMedicineName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [pharmacyCount, setPharmacyCount] = useState(0);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [inputError, setInputError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locationState, setLocationState] = useState<LocationState>("loading");

  const isPollingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "sending" || phase === "waiting";

  // ---------- Recent searches (stored on the device only) ----------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) setRecent(JSON.parse(saved));
    } catch {
      /* storage unavailable, ignore */
    }
  }, []);

  const rememberSearch = (name: string) => {
    setRecent((prev) => {
      const next = [name, ...prev.filter((n) => n !== name)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ---------- Location ----------
  const requestLocation = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost"
    ) {
      setLocationState("insecure");
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }

    setLocationState("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationState("precise");
      },
      () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLocationState("approx");
          },
          () => setLocationState("failed"),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  // ---------- Status polling ----------
  const fetchStatusDirectly = useCallback(async (reqId: string) => {
    try {
      const response = await fetch(
        `/api/check-status?id=${reqId}&ts=${Date.now()}`,
        {
          method: "GET",
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
          cache: "no-store",
        }
      );

      if (!response.ok) return false;

      const data = await response.json();

      if (data && (data.status === "available" || data.status === "unavailable")) {
        isPollingRef.current = false;
        setResult({
          status: data.status,
          pharmacyName: data.pharmacyName || "صيدلية قريبة",
        });
        setPhase("done");
        return true;
      }
    } catch (err) {
      console.error("Status check failed:", err);
    }
    return false;
  }, []);

  const runPolling = useCallback(
    (reqId: string) => {
      isPollingRef.current = true;
      let attempts = 0;

      const poll = async () => {
        if (!isPollingRef.current) return;

        if (attempts >= MAX_ATTEMPTS) {
          isPollingRef.current = false;
          setPhase("timeout");
          return;
        }

        const isDone = await fetchStatusDirectly(reqId);
        if (!isDone && isPollingRef.current) {
          attempts++;
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      poll();
    },
    [fetchStatusDirectly]
  );

  // Elapsed-time counter while waiting for pharmacies
  useEffect(() => {
    if (phase !== "waiting") return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Ask for location on load, and re-check when the user returns to the tab
  useEffect(() => {
    requestLocation();
    return () => {
      isPollingRef.current = false;
    };
  }, [requestLocation]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        activeRequestId &&
        phase === "waiting"
      ) {
        fetchStatusDirectly(activeRequestId);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [activeRequestId, phase, fetchStatusDirectly]);

  // ---------- Actions ----------
  const runSearch = async (rawName: string) => {
    const name = rawName.trim();

    if (!name) {
      setInputError("اكتب اسم الدواء أولاً");
      inputRef.current?.focus();
      return;
    }

    setInputError("");
    setMedicineName(name);
    setResult(null);
    setPharmacyCount(0);
    setStatusMessage("");
    setPhase("sending");

    try {
      const requestId = `REQ_${Date.now()}`;
      setActiveRequestId(requestId);

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName: name,
          userLat: coords.lat,
          userLng: coords.lng,
          radiusKm: 50,
          requestId,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        rememberSearch(name);
        setPharmacyCount(data.count);
        setPhase("waiting");
        runPolling(requestId);
      } else {
        setStatusMessage(
          data.message || "لم نجد صيدليات ضمن نطاق موقعك"
        );
        setPhase("error");
      }
    } catch (err) {
      console.error("Network error:", err);
      setStatusMessage("تعذر الاتصال بالشبكة. تحقق من الإنترنت وحاول مرة أخرى.");
      setPhase("error");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(medicineName);
  };

  const cancelWaiting = () => {
    isPollingRef.current = false;
    setPhase("idle");
  };

  const startOver = () => {
    isPollingRef.current = false;
    setResult(null);
    setMedicineName("");
    setStatusMessage("");
    setPhase("idle");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const loc = LOCATION_UI[locationState];
  const progress = Math.min(100, (elapsed / WAIT_SECONDS) * 100);

  return (
    <main className="min-h-screen bg-[#F1F7F4] px-4 py-6 text-[#10231F] sm:py-12">
      <div className="mx-auto w-full max-w-md">
        {/* Brand */}
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0F5C4D] text-white">
            <CapsuleIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">
              فارما كويك
            </h1>
            <p className="text-sm text-slate-600">
              اعرف أين يتوفر دواؤك قبل أن تخرج من البيت
            </p>
          </div>
        </header>

        <div className="rounded-2xl border border-[#D5E6DF] bg-white p-5 shadow-sm sm:p-6">
          {/* Location chip */}
          <div
            className={`mb-5 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${TONE_CLASSES[loc.tone]}`}
            role="status"
          >
            <PinIcon />
            <span className="flex-1">{loc.text}</span>
            {loc.retry && !busy && (
              <button
                type="button"
                onClick={requestLocation}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F5C4D]"
              >
                إعادة المحاولة
              </button>
            )}
          </div>

          {/* ---------- Search form (idle / error / timeout) ---------- */}
          {(phase === "idle" || phase === "error" || phase === "timeout") && (
            <form onSubmit={handleSubmit} noValidate>
              <label
                htmlFor="medicine"
                className="mb-2 block text-base font-bold"
              >
                ما اسم الدواء الذي تبحث عنه؟
              </label>

              <div className="relative">
                <SearchIcon className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="medicine"
                  ref={inputRef}
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  value={medicineName}
                  onChange={(e) => {
                    setMedicineName(e.target.value);
                    if (inputError) setInputError("");
                  }}
                  placeholder="مثال: بنادول إكسترا"
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? "medicine-error" : undefined}
                  className={`w-full rounded-xl border-2 bg-white py-4 pe-4 ps-12 text-lg font-semibold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
                    inputError
                      ? "border-rose-500 focus:ring-rose-100"
                      : "border-slate-300 focus:border-[#0F5C4D] focus:ring-emerald-100"
                  }`}
                />
              </div>

              {inputError && (
                <p
                  id="medicine-error"
                  className="mt-2 text-sm font-semibold text-rose-700"
                >
                  {inputError}
                </p>
              )}

              {recent.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-500">عمليات بحث سابقة</p>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => runSearch(name)}
                        className="rounded-full border border-[#D5E6DF] bg-[#F1F7F4] px-3 py-1.5 text-sm font-semibold text-[#0F5C4D] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F5C4D]"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0F5C4D] px-4 py-3 text-lg font-bold text-white shadow-sm transition active:scale-[0.98] hover:bg-[#0B4A3E] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                <SearchIcon />
                اسأل الصيدليات القريبة
              </button>

              {phase === "error" && (
                <div
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
                  role="alert"
                >
                  <p className="font-bold">{statusMessage}</p>
                </div>
              )}

              {phase === "timeout" && (
                <div
                  className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                  role="status"
                >
                  <p className="font-bold">
                    لم يرد أحد حتى الآن. قد تكون الصيدليات مغلقة أو مشغولة.
                  </p>
                  {activeRequestId && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("waiting");
                        runPolling(activeRequestId);
                      }}
                      className="w-full rounded-lg border border-amber-400 bg-white py-2.5 font-bold text-amber-900 active:scale-95"
                    >
                      متابعة الانتظار
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          {/* ---------- Sending ---------- */}
          {phase === "sending" && (
            <div className="py-8 text-center" role="status" aria-live="polite">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-[#0F5C4D]" />
              <p className="text-base font-bold">
                جاري إرسال طلبك للصيدليات...
              </p>
            </div>
          )}

          {/* ---------- Waiting for replies ---------- */}
          {phase === "waiting" && (
            <div className="text-center" role="status" aria-live="polite">
              <div className="relative mx-auto my-4 flex h-28 w-28 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-60 motion-reduce:animate-none" />
                <span className="absolute inset-3 rounded-full bg-emerald-100" />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#0F5C4D] text-3xl font-extrabold text-white">
                  {pharmacyCount}
                </span>
              </div>

              <p className="text-lg font-extrabold">
                أرسلنا طلبك إلى {pharmacyCount} صيدلية
              </p>
              <p className="mt-1 text-sm text-slate-600">
                نبحث عن «{medicineName}». سيظهر الرد هنا فور وصوله.
              </p>

              <div
                className="mx-auto mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-[#0F5C4D] transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                الانتظار عادةً أقل من دقيقتين
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    activeRequestId && fetchStatusDirectly(activeRequestId)
                  }
                  className="rounded-xl border-2 border-[#0F5C4D] py-3 font-bold text-[#0F5C4D] active:scale-95"
                >
                  تحديث الآن
                </button>
                <button
                  type="button"
                  onClick={cancelWaiting}
                  className="rounded-xl border-2 border-slate-200 py-3 font-bold text-slate-600 active:scale-95"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* ---------- Result ---------- */}
          {phase === "done" && result && (
            <div role="status" aria-live="polite">
              {result.status === "available" ? (
                <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-extrabold text-emerald-950">
                    الدواء متوفر
                  </h2>
                  <p className="mt-1 text-sm text-emerald-900">
                    «{medicineName}» متوفر لدى
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-950">
                    {result.pharmacyName}
                  </p>
                  <p className="mt-3 text-xs text-emerald-800">
                    ننصحك بالاتصال بالصيدلية للتأكد من السعر قبل الذهاب.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-rose-400 bg-rose-50 p-5 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-extrabold text-rose-950">
                    الدواء غير متوفر لدى {result.pharmacyName}
                  </h2>
                  <p className="mt-2 text-sm text-rose-900">
                    جرّب الاسم العلمي للدواء أو اسماً تجارياً بديلاً.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={startOver}
                className="mt-4 min-h-12 w-full rounded-xl bg-[#0F5C4D] py-3 text-base font-bold text-white active:scale-[0.98]"
              >
                بحث عن دواء آخر
              </button>
            </div>
          )}
        </div>

        {/* How it works */}
        {phase === "idle" && (
          <section
            className="mt-6 rounded-2xl border border-[#D5E6DF] bg-white/70 p-5"
            aria-label="كيف يعمل فارما كويك"
          >
            <h2 className="mb-3 text-base font-bold">كيف يعمل؟</h2>
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                  1
                </span>
                <span>اكتب اسم الدواء واضغط «اسأل الصيدليات القريبة».</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                  2
                </span>
                <span>نرسل سؤالك مباشرة إلى الصيدليات القريبة من موقعك.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F5C4D] text-xs font-bold text-white">
                  3
                </span>
                <span>يرد الصيدلي بـ «متوفر» أو «غير متوفر»، وتظهر لك النتيجة هنا.</span>
              </li>
            </ol>
            <p className="mt-4 border-t border-[#D5E6DF] pt-3 text-xs text-slate-500">
              نستخدم موقعك فقط لاختيار الصيدليات القريبة. لا تُحفظ بياناتك
              الشخصية.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}