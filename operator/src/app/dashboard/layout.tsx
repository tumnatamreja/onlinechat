'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearToken, apiFetch } from '@/lib/api';
import { getOrCreateKeyPair } from '@/lib/keychain';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [username, setUsername] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/');
      return;
    }
    getOrCreateKeyPair();
    apiFetch('/api/auth/me')
      .then((data) => {
        setUsername(data.operator.username);
        setReady(true);
      })
      .catch(() => {
        clearToken();
        router.replace('/');
      });
  }, [router]);

  function handleLogout() {
    clearToken();
    router.replace('/');
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mist font-display text-sm tracking-widest animate-pulse">
          установяване на връзка…
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-line bg-panel flex flex-col">
        <div className="px-5 py-5 border-b border-line">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-signal pulse-dot" />
            <span className="font-display text-xs uppercase tracking-[0.3em] text-mist">
              7hills private chat
            </span>
          </div>
          <p className="text-bone text-sm font-display">{username}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <a
            href="/dashboard"
            className="block px-3 py-2 rounded text-sm font-body text-bone hover:bg-line/60 transition-colors"
          >
            Разговори
          </a>
        </nav>

        <div className="px-3 py-4 border-t border-line">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded text-sm font-body text-mist hover:text-ember hover:bg-ember/10 transition-colors"
          >
            Изход
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
