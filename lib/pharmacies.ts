export interface Pharmacy {
  id: string;
  name: string;
  chat_id: string; // معرف التليجرام الخاص بالصيدلية (أو الجروب)
  lat: number;     // خط العرض الجغرافي
  lng: number;     // خط الطول الجغرافي
  phone?: string;  // رقم الهاتف (اختياري)
}

// 📌 قائمة الصيدليات المسجلة في النظام
export const pharmacies: Pharmacy[] = [
  {
    id: "arar-central",
    name: "صيدلية الدكتور محمد عبد الخالق",
    chat_id: "1364025965", // 👈 استبدل هذا بـ Chat ID الحقيقي من التليجرام
    lat: 30.979764,          // إحداثيات عرعر
    lng: 41.061999,
    phone: "0565897156",
  },
  {
    id: "pharmacy-2",
    name: "صيدلية الشفاء",
    chat_id: "9876543210", // 👈 Chat ID الخاص بالصيدلية الثانية
    lat: 30.9800,
    lng: 41.0400,
  },
];

// 🛠️ دالة الاستعلام الجغرافي المساندة
export async function queryPharmacies(
  userLat?: number,
  userLng?: number,
  radiusKm: number = 50
): Promise<Pharmacy[]> {
  if (!userLat || !userLng) {
    return pharmacies;
  }

  // فلترة الصيدليات حسب النطاق الجغرافي
  return pharmacies.filter((pharmacy) => {
    const distance = calculateDistance(userLat, userLng, pharmacy.lat, pharmacy.lng);
    return distance <= radiusKm;
  });
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default queryPharmacies;