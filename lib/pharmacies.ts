export interface Pharmacy {
  id: string;
  nameAr: string;
  phone: string;
  lat: number;
  lng: number;
  address: string;
  telegramChatId: string;
}

export const pharmacies: Pharmacy[] = [
  {
    id: 'ph-001',
    nameAr: 'صيدلية النور',
    phone: '+966565897156',
    lat: 30.979764,
    lng: 41.061999,
    address: 'شارع الملك فهد، حي الوسطى، عرعر',
    telegramChatId: '1364025965',
  },
  {
    id: 'ph-002',
    nameAr: 'صيدلية الشفاء',
    phone: '+966500000002',
    lat: 30.982,
    lng: 41.041,
    address: 'طريق الملك عبدالعزيز، حي الزهرة، عرعر',
    telegramChatId: '100000000002',
  },
];
