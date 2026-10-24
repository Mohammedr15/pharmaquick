"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type LocationState =
  | "loading"
  | "precise"
  | "approx"
  | "failed"
  | "denied"
  | "manual"
  | "insecure"
  | "unsupported";

type Phase = "idle" | "sending" | "waiting" | "done" | "timeout" | "error";

type Result = {
  status: "available" | "unavailable";
  pharmacyName: string;
};

// Used only when GPS fails. The UI warns the user when this happens.
const DEFAULT_COORDS = { lat: 30.9753, lng: 41.0381 };
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 60; // 2 minutes
const WAIT_SECONDS = (POLL_INTERVAL_MS * MAX_ATTEMPTS) / 1000;
const RECENT_KEY = "pharmaquick_recent";

// Optional: put your own photo at public/images/hero.jpg (square, ~600x600).
// If the file does not exist, the built-in illustration is shown instead.
const HERO_PHOTO_SRC = "/images/hero.jpg";

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "صباح الخير ☀️";
  if (h >= 12 && h < 18) return "مرحباً بك 👋";
  return "مساء الخير 🌙";
}

function waitingMood(seconds: number) {
  if (seconds < 10) return "📨 الصيدليات تستلم طلبك";
  if (seconds < 40) return "💊 الصيدلي يتفقد الرف";
  if (seconds < 90) return "⏳ نترقّب الرد";
  return "🙏 شكراً لصبرك";
}

const CONFETTI_PIECES = [
  { left: "6%", color: "#FF7A59", delay: "0s" },
  { left: "14%", color: "#F5B93A", delay: "0.15s" },
  { left: "22%", color: "#22C55E", delay: "0.05s" },
  { left: "31%", color: "#FF7A59", delay: "0.3s" },
  { left: "39%", color: "#0A4A44", delay: "0.1s" },
  { left: "47%", color: "#F5B93A", delay: "0.25s" },
  { left: "55%", color: "#22C55E", delay: "0s" },
  { left: "63%", color: "#FF7A59", delay: "0.2s" },
  { left: "71%", color: "#0A4A44", delay: "0.35s" },
  { left: "79%", color: "#F5B93A", delay: "0.08s" },
  { left: "86%", color: "#22C55E", delay: "0.28s" },
  { left: "93%", color: "#FF7A59", delay: "0.18s" },
];

const LOCATION_UI: Record<
  LocationState,
  { text: string; tone: "ok" | "warn" | "wait"; retry: boolean }
> = {
  loading: { text: "جاري تحديد موقعك...", tone: "wait", retry: false },
  precise: { text: "تم تحديد موقعك", tone: "ok", retry: true },
  approx: { text: "تم تحديد موقعك (دقة تقريبية)", tone: "ok", retry: true },
  manual: { text: "تم اختيار موقعك يدوياً", tone: "ok", retry: true },
  denied: {
    text: "إذن الموقع مرفوض في المتصفح. فعّله ثم اضغط «تفعيل الموقع»، أو اختر مدينتك من القائمة.",
    tone: "warn",
    retry: true,
  },
  failed: {
    text: "تعذر تحديد موقعك. تأكد من تشغيل خدمة الموقع (GPS) في جهازك ومن اتصال الإنترنت، أو اختر مدينتك من القائمة.",
    tone: "warn",
    retry: true,
  },
  insecure: {
    text: "افتح الموقع عبر رابط آمن (HTTPS) ليعمل تحديد الموقع، أو اختر مدينتك من القائمة.",
    tone: "warn",
    retry: false,
  },
  unsupported: {
    text: "المتصفح لا يدعم تحديد الموقع. اختر مدينتك من القائمة.",
    tone: "warn",
    retry: false,
  },
};

// Used when GPS is unavailable (denied, desktop without location, etc.)
const EGYPT_CITIES = [
  { name: "القاهرة", lat: 30.0444, lng: 31.2357 },
  { name: "الجيزة", lat: 30.0131, lng: 31.2089 },
  { name: "الإسكندرية", lat: 31.2001, lng: 29.9187 },
  { name: "بورسعيد", lat: 31.2653, lng: 32.3019 },
  { name: "السويس", lat: 29.9668, lng: 32.5498 },
  { name: "الإسماعيلية", lat: 30.5965, lng: 32.2715 },
  { name: "الزقازيق", lat: 30.5877, lng: 31.5021 },
  { name: "بنها", lat: 30.466, lng: 31.1848 },
  { name: "طنطا", lat: 30.7865, lng: 31.0004 },
  { name: "المنصورة", lat: 31.0409, lng: 31.3785 },
  { name: "دمنهور", lat: 31.0341, lng: 30.4682 },
  { name: "الفيوم", lat: 29.3084, lng: 30.8428 },
  { name: "بني سويف", lat: 29.0661, lng: 31.0994 },
  { name: "المنيا", lat: 28.1099, lng: 30.7503 },
  { name: "أسيوط", lat: 27.1783, lng: 31.1859 },
  { name: "سوهاج", lat: 26.5591, lng: 31.6957 },
  { name: "قنا", lat: 26.1551, lng: 32.716 },
  { name: "الأقصر", lat: 25.6872, lng: 32.6396 },
  { name: "أسوان", lat: 24.0889, lng: 32.8998 },
  { name: "الغردقة", lat: 27.2579, lng: 33.8116 },
];

type Platform = "ios" | "android" | "desktop";

const LOCATION_HELP: Record<Platform, string> = {
  ios: "على iPhone: اضغط «aA» في شريط العنوان ← «إعدادات الموقع الإلكتروني» ← «الموقع» ← «سماح». وتأكد من تشغيل «خدمات الموقع» من الإعدادات ← الخصوصية والأمان.",
  android:
    "على Android: اضغط أيقونة القفل بجانب الرابط ← «الأذونات» ← «الموقع» ← «سماح». وتأكد من تشغيل «الموقع» (GPS) من الإعدادات السريعة.",
  desktop:
    "على الكمبيوتر: اضغط أيقونة القفل بجانب الرابط ← «الموقع» ← «سماح». وإن استمرت المشكلة، فعّل خدمات الموقع من إعدادات النظام (Windows: الخصوصية والأمان ← الموقع).",
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

// Facebook / Instagram / TikTok in-app browsers often block location access
function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Snapchat|TikTok|Messenger|MicroMessenger|Line\//i.test(
    navigator.userAgent
  );
}

function getPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  );
}

const LOCATION_TONE = {
  ok: "text-emerald-800",
  wait: "text-slate-500",
  warn: "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900",
};

type IconName =
  | "pin"
  | "search"
  | "capsule"
  | "check"
  | "close"
  | "chat"
  | "shield"
  | "bolt"
  | "refresh";

const ICONS: Record<IconName, React.ReactNode> = {
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  capsule: (
    <>
      <path d="m10.5 20.5-7-7a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" />
      <path d="m8.5 8.5 7 7" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
};

function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 2,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function Confetti() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"
      aria-hidden="true"
    >
      <style>{`@keyframes pq-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(240px) rotate(540deg);opacity:0}}`}</style>
      {CONFETTI_PIECES.map((piece, i) => (
        <span
          key={i}
          className="absolute top-0 h-2.5 w-1.5 rounded-sm"
          style={{
            left: piece.left,
            backgroundColor: piece.color,
            opacity: 0,
            animation: `pq-fall 1.8s ease-out ${piece.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}

function HeroVisual() {
  const [photoOk, setPhotoOk] = useState(false);

  // Use the real photo only if the file exists
  useEffect(() => {
    const img = new Image();
    img.onload = () => setPhotoOk(true);
    img.src = HERO_PHOTO_SRC;
  }, []);

  if (photoOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={HERO_PHOTO_SRC}
        alt=""
        width={112}
        height={112}
        className="h-28 w-28 shrink-0 rounded-2xl object-cover ring-4 ring-white"
      />
    );
  }

  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="#FFFFFF" />
      <g transform="rotate(-35 60 60)">
        <rect x="22" y="44" width="76" height="32" rx="16" fill="#FFFFFF" />
        <path d="M60 44h22a16 16 0 0 1 0 32H60z" fill="#FF7A59" />
        <rect x="22" y="44" width="76" height="32" rx="16" fill="none" stroke="#0A4A44" strokeWidth="3" />
        <path d="M60 44v32" stroke="#0A4A44" strokeWidth="3" />
      </g>
      <circle cx="92" cy="28" r="14" fill="#FFFFFF" />
      <path d="M92 21v14M85 28h14" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 94s11-9 11-17a11 11 0 0 0-22 0c0 8 11 17 11 17z" fill="#F5B93A" />
      <circle cx="30" cy="77" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} ثانية`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} دقيقة و${s} ثانية` : `${m} دقيقة`;
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
  const [greeting, setGreeting] = useState("");

  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locationState, setLocationState] = useState<LocationState>("loading");
  const [manualCity, setManualCity] = useState("");
  const [env, setEnv] = useState<{ platform: Platform; inApp: boolean }>({
    platform: "desktop",
    inApp: false,
  });
  const manualRef = useRef("");

  const isPollingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = phase === "sending" || phase === "waiting";

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  // ---------- Recent searches (stored on the device only) ----------
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) setRecent(JSON.parse(saved));
    } catch {
      /* storage unavailable */
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
  // Fast attempt first (works on desktop and mobile; a 50 km radius needs no GPS precision),
  // then a high-accuracy retry. Returns the coordinates, or null if unavailable.
  const requestLocation = useCallback(async (): Promise<{
    lat: number;
    lng: number;
  } | null> => {
    if (typeof window === "undefined") return null;

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setLocationState("insecure");
      return null;
    }

    if (!("geolocation" in navigator)) {
      setLocationState("unsupported");
      return null;
    }

    setLocationState("loading");

    const apply = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Invalid coordinates");
      }
      const found = { lat: latitude, lng: longitude };
      manualRef.current = "";
      setManualCity("");
      setCoords(found);
      setLocationState(accuracy <= 1500 ? "precise" : "approx");
      return found;
    };

    const fail = (code?: number) =>
      setLocationState(
        manualRef.current ? "manual" : code === 1 ? "denied" : "failed"
      );

    try {
      return apply(
        await getPosition({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000,
        })
      );
    } catch (e) {
      const code = (e as { code?: number })?.code;
      if (code === 1) {
        fail(code);
        return null;
      }
    }

    try {
      return apply(
        await getPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        })
      );
    } catch (e) {
      fail((e as { code?: number })?.code);
      return null;
    }
  }, []);

  const chooseCity = (name: string) => {
    const city = EGYPT_CITIES.find((c) => c.name === name);
    if (!city) return;
    manualRef.current = city.name;
    setManualCity(city.name);
    setCoords({ lat: city.lat, lng: city.lng });
    setInputError("");
    setLocationState("manual");
  };

  // ---------- Status polling (same endpoint and response shape as before) ----------
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

  // Elapsed-time counter while waiting
  useEffect(() => {
    if (phase !== "waiting") return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    setEnv({ platform: detectPlatform(), inApp: isInAppBrowser() });
    requestLocation();
    return () => {
      isPollingRef.current = false;
    };
  }, [requestLocation]);

  // When the user enables location from the browser settings, pick it up automatically
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status?.state === "granted") requestLocation();
    };
    try {
      navigator.permissions
        ?.query({ name: "geolocation" as PermissionName })
        .then((st) => {
          if (cancelled) return;
          status = st;
          st.addEventListener("change", onChange);
        })
        .catch(() => {});
    } catch {
      /* Permissions API not available */
    }
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [requestLocation]);

  // Re-check when the user comes back from the browser/system settings
  useEffect(() => {
    if (locationState !== "denied" && locationState !== "failed") return;
    const recheck = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const st = await navigator.permissions?.query({
          name: "geolocation" as PermissionName,
        });
        if (st && st.state === "granted") requestLocation();
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [locationState, requestLocation]);

  // Refresh immediately when the user returns from Telegram / another app
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

    // Make sure we have a real location (or a chosen city) before asking pharmacies
    let searchCoords = coords;
    if (!["precise", "approx", "manual"].includes(locationState)) {
      const fresh = await requestLocation();
      if (fresh) {
        searchCoords = fresh;
      } else if (!manualRef.current) {
        setPhase("idle");
        setInputError(
          "حدد موقعك أولاً: فعّل الموقع أو اختر مدينتك من القائمة أدناه."
        );
        return;
      }
    }

    try {
      const requestId = `REQ_${Date.now()}`;
      setActiveRequestId(requestId);

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName: name,
          userLat: searchCoords.lat,
          userLng: searchCoords.lng,
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
        setStatusMessage(data.message || "لم نجد صيدليات ضمن نطاق موقعك");
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

  // Back to the form: keep the text (to edit it) or clear it (new medicine)
  const backToForm = (keepText: boolean) => {
    isPollingRef.current = false;
    setResult(null);
    setStatusMessage("");
    if (!keepText) setMedicineName("");
    setPhase("idle");
    setTimeout(() => {
      inputRef.current?.focus();
      if (keepText) inputRef.current?.select();
    }, 0);
  };

  const loc = LOCATION_UI[locationState];
  const locText =
    locationState === "manual" ? `تم اختيار موقعك يدوياً: ${manualCity}` : loc.text;
  const showHelp = locationState === "denied" || locationState === "failed";
  const showCityPicker = ["denied", "failed", "unsupported", "insecure", "manual"].includes(
    locationState
  );
  const showInAppTip = env.inApp && !["precise", "approx", "manual"].includes(locationState);
  const progress = Math.min(100, (elapsed / WAIT_SECONDS) * 100);
  const showForm = phase === "idle" || phase === "error" || phase === "timeout";

  return (
    <main className="min-h-screen bg-[#F3F7F5] text-[#0F2421]">
      {/* ---------- Header ---------- */}
      <header className="relative overflow-hidden rounded-b-3xl bg-[#E3F1EC] px-4 pb-24 pt-6 text-[#0F2421]">
        <span className="pointer-events-none absolute -start-12 -top-12 h-44 w-44 rounded-full bg-white/60" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-16 end-10 h-40 w-40 rounded-full bg-emerald-200/40" aria-hidden="true" />
        <div className="relative mx-auto max-w-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A4A44] text-white">
              <Icon name="capsule" className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-extrabold">فارما كويك</p>
              <p className="text-xs text-slate-600">PharmaQuick</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="min-h-5 text-sm font-bold text-[#0A4A44]">
                {greeting}
              </p>
              <h1 className="mt-1 text-[1.6rem] font-extrabold leading-snug">
                هل دواؤك متوفر في صيدلية قريبة؟
              </h1>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-700">
                اعرف التوافر اللحظي للدواء في الصيدليات القريبة منك.
              </p>
            </div>
            <HeroVisual />
          </div>
        </div>
      </header>

      {/* ---------- Main card (overlaps header) ---------- */}
      <div className="mx-auto -mt-16 max-w-md px-4 pb-10">
        <div className="rounded-2xl bg-white p-5 shadow-[0_10px_30px_rgba(10,74,68,0.14)] ring-1 ring-[#DCE8E4] sm:p-6">
          {/* Form */}
          {showForm && (
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="medicine" className="mb-2 block text-base font-bold">
                اسم الدواء
              </label>

              <div className="relative">
                <Icon
                  name="search"
                  className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                />
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
                  className={`w-full rounded-xl border-2 bg-white py-4 pe-4 ps-12 text-lg font-semibold placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-4 ${
                    inputError
                      ? "border-rose-500 focus:ring-rose-100"
                      : "border-slate-300 focus:border-[#0A4A44] focus:ring-emerald-100"
                  }`}
                />
              </div>

              {inputError && (
                <p id="medicine-error" className="mt-2 text-sm font-semibold text-rose-700">
                  {inputError}
                </p>
              )}

              {recent.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    عمليات بحث سابقة
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => runSearch(name)}
                        className="rounded-full border border-[#CFE0DA] bg-[#F3F7F5] px-3.5 py-1.5 text-sm font-semibold text-[#0A4A44] transition active:scale-95 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0A4A44]"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Location: quiet when fine, prominent when there is a problem */}
              <div className="mt-5" role="status">
                <div
                  className={`flex items-start gap-2 text-[0.8rem] ${LOCATION_TONE[loc.tone]}`}
                >
                  <Icon name="pin" className="mt-0.5 h-4 w-4" />
                  <span className="flex-1 leading-relaxed">{locText}</span>
                  {loc.retry && (
                    <button
                      type="button"
                      onClick={() => {
                        requestLocation();
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0A4A44]"
                    >
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                      {locationState === "approx" || locationState === "precise"
                        ? "تحديث الموقع"
                        : "تفعيل الموقع"}
                    </button>
                  )}
                </div>

                {showInAppTip && (
                  <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[0.8rem] leading-relaxed text-amber-900">
                    يبدو أنك تفتح الموقع من داخل تطبيق (مثل فيسبوك أو إنستغرام). افتح
                    الرابط في Chrome أو Safari ليعمل تحديد الموقع.
                  </p>
                )}

                {showHelp && (
                  <details className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[0.8rem] text-slate-700">
                    <summary className="cursor-pointer font-bold text-[#0A4A44]">
                      كيف أفعّل الموقع؟
                    </summary>
                    <p className="mt-2 leading-relaxed">
                      {LOCATION_HELP[env.platform]}
                    </p>
                  </details>
                )}

                {showCityPicker && (
                  <div className="mt-3">
                    <label
                      htmlFor="city"
                      className="mb-1.5 block text-sm font-bold"
                    >
                      أو اختر مدينتك
                    </label>
                    <select
                      id="city"
                      value={manualCity}
                      onChange={(e) => chooseCity(e.target.value)}
                      className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-base font-semibold focus:border-[#0A4A44] focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    >
                      <option value="" disabled>
                        اختر المدينة
                      </option>
                      {EGYPT_CITIES.map((city) => (
                        <option key={city.name} value={city.name}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D1480F] px-4 py-3 text-lg font-bold text-white shadow-md shadow-orange-200 transition active:scale-[0.98] hover:bg-[#B93D0A] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                <Icon name="search" />
                اسأل الصيدليات القريبة
              </button>

              {phase === "error" && (
                <div
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900"
                  role="alert"
                >
                  {statusMessage}
                </div>
              )}

              {phase === "timeout" && (
                <div
                  className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
                  role="status"
                >
                  <p className="font-bold leading-relaxed">
                    لم يرد أحد حتى الآن. قد تكون الصيدليات مغلقة أو مشغولة.
                  </p>
                  {activeRequestId && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhase("waiting");
                        runPolling(activeRequestId);
                      }}
                      className="w-full rounded-lg border border-amber-400 bg-white py-2.5 font-bold active:scale-95"
                    >
                      متابعة الانتظار
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          {/* Sending */}
          {phase === "sending" && (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-[#0A4A44] motion-reduce:animate-none" />
              <p className="text-base font-bold">جاري إرسال طلبك للصيدليات...</p>
            </div>
          )}

          {/* Waiting */}
          {phase === "waiting" && (
            <div role="status" aria-live="polite">
              <div className="text-center">
                <div className="relative mx-auto my-3 flex h-28 w-28 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200/70 motion-reduce:animate-none" />
                  <span className="absolute inset-3 rounded-full bg-emerald-100" />
                  <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#0A4A44] text-3xl font-extrabold text-white">
                    {pharmacyCount}
                  </span>
                </div>
                <p className="text-lg font-extrabold">
                  أرسلنا طلبك إلى {pharmacyCount} صيدلية
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  نسأل عن «{medicineName}»
                </p>
                <p className="mt-3 inline-block rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-[#0A4A44]">
                  {waitingMood(elapsed)}
                </p>
              </div>

              {/* Progress steps */}
              <ol className="mt-6 space-y-3 text-sm">
                <li className="flex items-center gap-3 font-semibold text-emerald-800">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-white">
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  تم إرسال الطلب
                </li>
                <li className="flex items-center gap-3 font-bold text-[#0F2421]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0A4A44]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#0A4A44] motion-reduce:animate-none" />
                  </span>
                  بانتظار رد الصيدلي
                </li>
                <li className="flex items-center gap-3 text-slate-500">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-200" />
                  تظهر النتيجة هنا
                </li>
              </ol>

              <div
                className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-[#0A4A44] transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                نتابع الردود تلقائياً لمدة دقيقتين.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => activeRequestId && fetchStatusDirectly(activeRequestId)}
                  className="rounded-xl border-2 border-[#0A4A44] py-3 font-bold text-[#0A4A44] active:scale-95"
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

          {/* Result */}
          {phase === "done" && result && (
            <div role="status" aria-live="polite">
              {result.status === "available" ? (
                <div className="relative overflow-hidden rounded-2xl border border-emerald-300">
                  <Confetti />
                  <div className="flex items-center gap-3 bg-emerald-700 px-5 py-4 text-white">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl">
                      🎉
                    </span>
                    <h2 className="text-xl font-extrabold">الدواء متوفر</h2>
                  </div>
                  <div className="space-y-1 bg-emerald-50 px-5 py-4">
                    <p className="text-sm text-emerald-900">
                      «{medicineName}» متوفر لدى
                    </p>
                    <p className="text-xl font-extrabold text-emerald-950">
                      {result.pharmacyName}
                    </p>
                    <p className="pt-2 text-xs leading-relaxed text-emerald-800">
                      ردّت الصيدلية خلال {formatDuration(elapsed)}. ننصحك بالتأكد من
                      السعر مع الصيدلية قبل الذهاب.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-rose-300">
                  <div className="flex items-center gap-3 bg-rose-700 px-5 py-4 text-white">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl">
                      😔
                    </span>
                    <h2 className="text-xl font-extrabold">الدواء غير متوفر</h2>
                  </div>
                  <div className="space-y-1 bg-rose-50 px-5 py-4">
                    <p className="text-sm text-rose-900">
                      «{medicineName}» غير متوفر لدى
                    </p>
                    <p className="text-xl font-extrabold text-rose-950">
                      {result.pharmacyName}
                    </p>
                    <p className="pt-2 text-xs leading-relaxed text-rose-800">
                      لا تقلق 💙 جرّب الاسم العلمي للدواء أو اسماً تجارياً بديلاً.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3">
                {result.status === "unavailable" && (
                  <button
                    type="button"
                    onClick={() => backToForm(true)}
                    className="min-h-12 w-full rounded-xl bg-[#0A4A44] py-3 text-base font-bold text-white active:scale-[0.98]"
                  >
                    جرّب اسماً آخر
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => backToForm(false)}
                  className={`min-h-12 w-full rounded-xl py-3 text-base font-bold active:scale-[0.98] ${
                    result.status === "available"
                      ? "bg-[#0A4A44] text-white"
                      : "border-2 border-slate-200 text-slate-700"
                  }`}
                >
                  بحث عن دواء آخر
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Idle-only information ---------- */}
        {phase === "idle" && (
          <>
            <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-700">
              {(
                [
                  { icon: "bolt", label: "رد مباشر من الصيدلي" },
                  { icon: "pin", label: "صيدليات قريبة منك" },
                  { icon: "shield", label: "بدون تسجيل" },
                ] as { icon: IconName; label: string }[]
              ).map((item) => (
                <li
                  key={item.label}
                  className="flex flex-col items-center gap-2 rounded-xl bg-white px-2 py-3 ring-1 ring-[#DCE8E4]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-[#0A4A44]">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>

            <section
              className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-[#DCE8E4]"
              aria-label="كيف يعمل فارما كويك"
            >
              <h2 className="mb-4 text-base font-bold">كيف يعمل؟</h2>
              <ol className="space-y-4 text-sm leading-relaxed text-slate-700">
                {[
                  "اكتب اسم الدواء واضغط «اسأل الصيدليات القريبة».",
                  "نرسل سؤالك مباشرة إلى الصيدليات القريبة من موقعك.",
                  "يرد الصيدلي بـ «متوفر» أو «غير متوفر» وتظهر لك النتيجة هنا.",
                ].map((text, i) => (
                  <li key={text} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A4A44] text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {/* ---------- Footer ---------- */}
        <footer className="mt-6 space-y-2 text-center text-xs leading-relaxed text-slate-600">
          <p>نستخدم موقعك فقط لاختيار الصيدليات القريبة، ولا نطلب بياناتك الشخصية.</p>
          <p className="font-semibold text-slate-600">
            في الحالات الطارئة اتصل بالإسعاف مباشرة على 123.
          </p>
        </footer>
      </div>
    </main>
  );
}