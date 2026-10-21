import './globals.css';
import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'فارما كويك | PharmaQuick',
  description: 'بحث فوري عن الأدوية في الصيدليات القريبة وإرسال إشعار عبر تيليجرام',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${cairo.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
