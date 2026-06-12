import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GhostLine — Operator Console',
  description: 'End-to-end encrypted support channel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
