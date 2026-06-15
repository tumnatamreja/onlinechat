'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL, setToken } from '@/lib/api';

type Step = 'idle' | 'loading' | 'done' | 'error' | 'already';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function runSetup() {
    setStep('loading');
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setStep('already');
          return;
        }
        throw new Error(data.error || 'Setup failed');
      }

      // Store keypair in localStorage — no F12 needed
      localStorage.setItem(
        'ghostline_operator_keypair',
        JSON.stringify({ publicKey: data.publicKey, secretKey: data.secretKey })
      );

      // Also log in immediately and store token
      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const loginData = await loginRes.json();
      if (loginRes.ok) setToken(loginData.token);

      setInfo(`Потребител: ${data.username}\nПарола: ${data.password}`);
      setStep('done');
    } catch (e: any) {
      setError(e.message);
      setStep('error');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0B0E14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <p
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#5EE6A8',
            marginBottom: 16,
          }}
        >
          ● ghostline · setup
        </p>

        {step === 'idle' && (
          <>
            <h1 style={{ color: '#E9EDF3', fontSize: 22, marginBottom: 8 }}>
              Създай оператор акаунт
            </h1>
            <p style={{ color: '#8893A6', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              Това се прави само веднъж. След натискане на бутона акаунтът се създава
              автоматично и ключовете се запазват в браузъра.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Потребителско име"
                style={inputStyle}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Парола"
                style={inputStyle}
              />
            </div>

            <button onClick={runSetup} style={btnStyle}>
              Създай и влез →
            </button>
          </>
        )}

        {step === 'loading' && (
          <p style={{ color: '#5EE6A8', fontFamily: 'monospace', fontSize: 14 }}>
            Генериране на ключове и създаване на акаунт…
          </p>
        )}

        {step === 'done' && (
          <>
            <h1 style={{ color: '#5EE6A8', fontSize: 22, marginBottom: 12 }}>✅ Готово!</h1>
            <pre
              style={{
                background: '#11151D',
                border: '1px solid #1E2530',
                borderRadius: 8,
                padding: 14,
                color: '#E9EDF3',
                fontSize: 13,
                marginBottom: 20,
                whiteSpace: 'pre-wrap',
              }}
            >
              {info}
            </pre>
            <button onClick={() => router.push('/dashboard')} style={btnStyle}>
              Към конзолата →
            </button>
          </>
        )}

        {step === 'already' && (
          <>
            <h1 style={{ color: '#FF6B4A', fontSize: 20, marginBottom: 12 }}>
              Акаунтът вече съществува
            </h1>
            <p style={{ color: '#8893A6', fontSize: 13, marginBottom: 20 }}>
              Setup е вече направен. Влез директно в конзолата.
            </p>
            <button onClick={() => router.push('/')} style={btnStyle}>
              Към входа →
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <p style={{ color: '#FF6B4A', fontSize: 14, marginBottom: 16 }}>{error}</p>
            <button onClick={() => setStep('idle')} style={{ ...btnStyle, background: '#1E2530', color: '#E9EDF3' }}>
              Опитай пак
            </button>
          </>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#11151D',
  border: '1px solid #1E2530',
  borderRadius: 8,
  color: '#E9EDF3',
  padding: '12px 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
};

const btnStyle: React.CSSProperties = {
  background: '#5EE6A8',
  color: '#0B0E14',
  border: 'none',
  borderRadius: 8,
  fontFamily: 'monospace',
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '14px 20px',
  cursor: 'pointer',
  width: '100%',
};
