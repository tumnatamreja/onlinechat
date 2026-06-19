'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'idle' | 'loading' | 'done' | 'error' | 'already';

const API = 'http://78.17.71.141';

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
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);

      const res = await fetch(`${API}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: ctrl.signal,
      });
      clearTimeout(t);

      let data: any = {};
      try { data = await res.json(); } catch {}

      if (res.status === 403) { setStep('already'); return; }
      if (!res.ok) throw new Error(data.error || `Грешка ${res.status}`);

      localStorage.setItem('ghostline_operator_keypair',
        JSON.stringify({ publicKey: data.publicKey, secretKey: data.secretKey }));

      const lr = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const ld = await lr.json();
      if (lr.ok) localStorage.setItem('ghostline_token', ld.token);

      setInfo(`Потребител: ${username}\nПарола: ${password}`);
      setStep('done');
    } catch (e: any) {
      setError(e.name === 'AbortError' ? 'Timeout — провери дали сървърът работи.' : (e.message || 'Грешка'));
      setStep('error');
    }
  }

  const inp: React.CSSProperties = { background:'#11151D', border:'1px solid #1E2530', borderRadius:8, color:'#E9EDF3', padding:'12px 14px', fontSize:15, fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' };
  const btn: React.CSSProperties = { background:'#5EE6A8', color:'#0B0E14', border:'none', borderRadius:8, fontFamily:'monospace', fontSize:13, textTransform:'uppercase', letterSpacing:'0.1em', padding:'14px 20px', cursor:'pointer', width:'100%' };

  return (
    <main style={{ minHeight:'100vh', background:'#0B0E14', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'Inter,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:360 }}>
        <p style={{ fontFamily:'monospace', fontSize:11, letterSpacing:'0.3em', textTransform:'uppercase', color:'#5EE6A8', marginBottom:20 }}>● ghostline · setup</p>

        {step === 'idle' && <>
          <h1 style={{ color:'#E9EDF3', fontSize:22, marginBottom:8, fontWeight:600 }}>Създай оператор акаунт</h1>
          <p style={{ color:'#8893A6', fontSize:13, marginBottom:24, lineHeight:1.6 }}>Само веднъж. Всичко се запазва автоматично.</p>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Потребителско иmе" style={inp} />
            <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Парола" style={inp} />
          </div>
          <button onClick={runSetup} style={btn}>Създай и влез →</button>
        </>}

        {step === 'loading' && <div style={{ textAlign:'center' }}>
          <p style={{ color:'#5EE6A8', fontFamily:'monospace', fontSize:14, marginBottom:8 }}>Генериране на ключове…</p>
          <p style={{ color:'#8893A6', fontSize:12 }}>До 15 секунди</p>
        </div>}

        {step === 'done' && <>
          <h2 style={{ color:'#5EE6A8', fontSize:20, marginBottom:16 }}>✅ Готово!</h2>
          <pre style={{ background:'#11151D', border:'1px solid #1E2530', borderRadius:8, padding:14, color:'#E9EDF3', fontSize:13, marginBottom:20, whiteSpace:'pre-wrap' }}>{info}</pre>
          <button onClick={()=>router.push('/dashboard')} style={btn}>Към конзолата →</button>
        </>}

        {step === 'already' && <>
          <p style={{ color:'#FF6B4A', fontSize:14, marginBottom:16 }}>Акаунтът вече е създаден. Влез директно.</p>
          <button onClick={()=>router.push('/')} style={btn}>Към входа →</button>
        </>}

        {step === 'error' && <>
          <p style={{ color:'#FF6B4A', fontSize:13, padding:12, background:'rgba(255,107,74,0.08)', border:'1px solid rgba(255,107,74,0.3)', borderRadius:8, marginBottom:16 }}>{error}</p>
          <button onClick={()=>setStep('idle')} style={{ ...btn, background:'#1E2530', color:'#E9EDF3' }}>Опитай пак</button>
        </>}
      </div>
    </main>
  );
}
