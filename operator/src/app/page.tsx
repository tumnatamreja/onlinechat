'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken, getToken } from '@/lib/api';
import { getOrCreateKeyPair } from '@/lib/keychain';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);

      // Ensure local keypair exists; warn if server's stored public key
      // doesn't match (means this is a different device).
      const kp = getOrCreateKeyPair();
      if (kp.publicKey !== data.operator.publicKey) {
        // Different device / first login here — push our public key so
        // clients encrypt to the key whose secret we hold.
        await apiFetch('/api/auth/keypair', {
          method: 'PUT',
          body: JSON.stringify({ publicKey: kp.publicKey }),
        });
      }

      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center scanline-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-signal pulse-dot" />
            <span className="font-display text-xs uppercase tracking-[0.3em] text-mist">
              ghostline
            </span>
          </div>
          <h1 className="font-display text-2xl text-bone encrypted-glow">
            Operator Console
          </h1>
          <p className="text-mist text-sm mt-2">
            Sign in. Your encryption key never leaves this device.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-panel border border-line rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-mist mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-ink border border-line rounded px-3 py-2.5 text-bone font-body focus:outline-none focus:border-signal transition-colors"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-mist mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-ink border border-line rounded px-3 py-2.5 text-bone font-body focus:outline-none focus:border-signal transition-colors"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-body border border-ember/30 bg-ember/10 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal text-ink font-display text-sm uppercase tracking-wider rounded px-4 py-2.5 hover:bg-signal/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Connecting…' : 'Enter'}
          </button>
        </form>

        <p className="text-center text-mist text-xs mt-6 font-display tracking-wide">
          All messages are encrypted end-to-end · 0 third parties
        </p>
      </div>
    </main>
  );
}
