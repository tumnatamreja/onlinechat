import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '7Hills Private Chat — Admin',
  description: 'Криптиран частен чат канал',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
