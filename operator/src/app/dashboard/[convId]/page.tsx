'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOperatorSocket } from '@/lib/socket';
import { getOrCreateKeyPair } from '@/lib/keychain';
import { encryptMessage, decryptMessage } from '@/lib/crypto';
import { apiFetch, API_URL } from '@/lib/api';
import { DecryptedMessage, Message, Department, DEPARTMENT_LABELS } from '@/lib/types';

export default function ConversationPage() {
  const { convId } = useParams<{ convId: string }>();
  const router = useRouter();

  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [clientPublicKey, setClientPublicKey] = useState<string | null>(null);
  const clientPublicKeyRef = useRef<string | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [clientTyping, setClientTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { secretKey } = getOrCreateKeyPair();

  useEffect(() => {
    clientPublicKeyRef.current = clientPublicKey;
  }, [clientPublicKey]);

  function decryptIncoming(msg: Message): DecryptedMessage {
    const pk = clientPublicKeyRef.current;
    if (!pk) return { ...msg, plaintext: null };
    return { ...msg, plaintext: decryptMessage(msg.encryptedContent, msg.nonce, pk, secretKey) };
  }

  useEffect(() => {
    const socket = getOperatorSocket();

    socket.on(
      'server:history',
      ({ conversationId, messages: msgs }: { conversationId: string; messages: Message[] }) => {
        if (conversationId !== convId) return;
        // We need the client's public key to decrypt; fetch via REST is simplest
        // but we don't have a conv-detail endpoint, so derive from first message
        // exchange via socket. For now, store raw and decrypt once we know the key.
        setMessages(msgs.map((m) => ({ ...m, plaintext: null })));
      }
    );

    socket.on('server:message', (msg: Message) => {
      if (msg.conversationId !== convId) return;
      setMessages((prev) => [...prev, decryptIncoming(msg)]);
    });

    socket.on('server:message_sent', (msg: Message) => {
      if (msg.conversationId !== convId) return;
      setMessages((prev) => [...prev, decryptIncoming(msg)]);
    });

    socket.on('server:client_typing', ({ typing }: { typing: boolean }) => {
      setClientTyping(typing);
    });

    return () => {
      socket.off('server:history');
      socket.off('server:message');
      socket.off('server:message_sent');
      socket.off('server:client_typing');
    };
  }, [convId]);

  // Fetch client public key once (needed for decryption + sending)
  const [fetchError, setFetchError] = useState<string | null>(null);

  function fetchConvDetails() {
    setFetchError(null);
    apiFetch(`/api/conversations/${convId}`)
      .then((data) => {
        setClientPublicKey(data.clientPublicKey);
        setDepartment(data.department);
        setClientLabel(data.clientLabel);
      })
      .catch((err: any) => {
        setFetchError(err.message || 'Неуспешно зареждане на разговора');
      });
  }

  useEffect(() => {
    fetchConvDetails();
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-decrypt all messages whenever clientPublicKey becomes available
  useEffect(() => {
    if (!clientPublicKey) return;
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        plaintext: decryptMessage(m.encryptedContent, m.nonce, clientPublicKey, secretKey),
      }))
    );
  }, [clientPublicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage() {
    if (!input.trim() || !clientPublicKey) return;
    const { encryptedContent, nonce } = encryptMessage(input.trim(), clientPublicKey, secretKey);
    getOperatorSocket().emit('operator:message', { conversationId: convId, encryptedContent, nonce });
    setInput('');
    notifyTyping(false);
  }

  let typingTimeout: ReturnType<typeof setTimeout>;
  function notifyTyping(typing: boolean) {
    getOperatorSocket().emit('operator:typing', { conversationId: convId, typing });
  }

  function handleInputChange(value: string) {
    setInput(value);
    notifyTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => notifyTyping(false), 1200);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clientPublicKey) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      // Encrypt file bytes
      const nacl = await import('tweetnacl');
      const { decodeBase64 } = await import('tweetnacl-util');
      const nonceBytes = nacl.default.randomBytes(nacl.default.box.nonceLength);
      const encrypted = nacl.default.box(
        bytes,
        nonceBytes,
        decodeBase64(clientPublicKey),
        decodeBase64(secretKey)
      );

      const form = new FormData();
      form.append('file', new Blob([encrypted.buffer as ArrayBuffer]), 'blob.enc');
      form.append('name', file.name);
      form.append('mime', file.type);

      const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: form });
      const { url, name, mime } = await res.json();

      // Also encrypt the filename as the "message content"
      const { encryptedContent, nonce } = encryptMessage(name, clientPublicKey, secretKey);

      getOperatorSocket().emit('operator:file', {
        conversationId: convId,
        encryptedContent,
        nonce,
        fileUrl: url,
        fileName: name,
        fileMime: mime,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function downloadFile(msg: DecryptedMessage) {
    if (!msg.fileUrl || !clientPublicKey) return;
    const res = await fetch(`${API_URL}${msg.fileUrl}`);
    const buf = new Uint8Array(await res.arrayBuffer());

    const nacl = await import('tweetnacl');
    const { decodeBase64 } = await import('tweetnacl-util');
    const decrypted = nacl.default.box.open(
      buf,
      decodeBase64(msg.nonce),
      decodeBase64(clientPublicKey),
      decodeBase64(secretKey)
    );
    if (!decrypted) {
      alert('Failed to decrypt file');
      return;
    }

    const blob = new Blob([decrypted.buffer as ArrayBuffer], { type: msg.fileMime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = msg.fileName || 'file';
    a.click();
    URL.revokeObjectURL(url);
  }

  function closeConversation() {
    getOperatorSocket().emit('operator:close', { conversationId: convId });
    router.push('/dashboard');
  }

  return (
    <main className="flex-1 flex flex-col h-screen">
      <header className="border-b border-line px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-sm text-bone">
              {clientLabel || `conversation_${String(convId).slice(0, 8)}`}
            </h1>
            {department && (
              <span className="text-[10px] font-display uppercase tracking-wider text-signal border border-signal/30 bg-signal/5 rounded-full px-2 py-0.5">
                {DEPARTMENT_LABELS[department] ?? department}
              </span>
            )}
          </div>
          <p className="text-mist text-xs mt-0.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            end-to-end encrypted
            {clientTyping && <span className="text-signal ml-2 animate-pulse">client is typing…</span>}
          </p>
        </div>
        <button
          onClick={closeConversation}
          className="text-xs font-display uppercase tracking-wider text-ember border border-ember/30 rounded px-3 py-1.5 hover:bg-ember/10 transition-colors"
        >
          Затвори
        </button>
      </header>

      {fetchError && (
        <div className="px-6 py-3 bg-ember/10 border-b border-ember/30 flex items-center justify-between">
          <p className="text-ember text-xs font-body">⚠ {fetchError}</p>
          <button
            onClick={fetchConvDetails}
            className="text-[10px] font-display uppercase tracking-wider text-ember border border-ember/30 rounded px-2 py-1 hover:bg-ember/10 transition-colors"
          >
            Опитай пак
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 scanline-bg">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.senderType === 'OPERATOR' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md rounded-lg px-4 py-2.5 border ${
                m.senderType === 'OPERATOR'
                  ? 'bg-signal/10 border-signal/30 text-bone'
                  : 'bg-panel border-line text-bone'
              }`}
            >
              {m.fileUrl ? (
                <button
                  onClick={() => downloadFile(m)}
                  className="text-signal underline text-sm font-display flex items-center gap-2"
                >
                  📎 {m.plaintext || m.fileName || 'encrypted file'} (decrypt &amp; download)
                </button>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">
                  {m.plaintext !== null ? m.plaintext : (
                    <span className="text-mist italic">[unable to decrypt]</span>
                  )}
                </p>
              )}
              <p className="text-[10px] text-mist mt-1 font-display">
                {new Date(m.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !clientPublicKey}
            className="text-mist hover:text-signal transition-colors px-2 disabled:opacity-40"
            title="Attach encrypted file"
          >
            📎
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={clientPublicKey ? 'Напиши съобщение…' : 'Зареждане…'}
            disabled={!clientPublicKey}
            className="flex-1 bg-ink border border-line rounded px-3 py-2.5 text-bone font-body text-sm focus:outline-none focus:border-signal transition-colors disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !clientPublicKey}
            className="bg-signal text-ink font-display text-xs uppercase tracking-wider rounded px-4 py-2.5 hover:bg-signal/90 transition-colors disabled:opacity-40"
          >
            Изпрати
          </button>
        </div>
      </div>
    </main>
  );
}
