// lib/pharmacies.ts

export interface Pharmacy {
  id: string;
  name: string;
  lat: number;
  lng: number;
  chatId: string;
  distance?: number;
}

export type PharmacyWithDistance = Pharmacy & { distance: number };

export const PHARMACIES_DATABASE: Pharmacy[] = [
  {
    id: "pharma_arar_1",
    name: "صيدلية الدواء - عرعر المركزية",
    lat: 30.979764,
    lng: 41.061999,
    chatId: "1364025965",
  },
  {
    id: "pharma_belqas_1",
    name: "صيدلية بلقاس - مصر",
    lat: 31.2141,
    lng: 31.3582,
    chatId: "123456789",
  },
];

export function calculateDistance(
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

export function queryPharmacies(
  userLat: number,
  userLng: number,
  radiusKm: number
): PharmacyWithDistance[] {
  const results: PharmacyWithDistance[] = [];

  for (const pharmacy of PHARMACIES_DATABASE) {
    const dist = calculateDistance(
      userLat,
      userLng,
      pharmacy.lat,
      pharmacy.lng
    );

    if (dist <= radiusKm) {
      results.push({
        ...pharmacy,
        distance: dist,
      });
    }
  }

  return results;
}