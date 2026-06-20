'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOperatorSocket } from '@/lib/socket';
import { getOrCreateKeyPair } from '@/lib/keychain';
import { decryptMessage } from '@/lib/crypto';
import { Conversation, Department, DEPARTMENT_LABELS, Message } from '@/lib/types';
import { avatarColor, formatRelativeTime } from '@/lib/ui';

const DEPT_FILTERS: { value: Department | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Всички' },
  { value: 'SUPPORT', label: 'Поддръжка' },
  { value: 'ORDERS', label: 'Поръчки' },
  { value: 'OTHER', label: 'Друго' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<Department | 'ALL'>('ALL');
  const { secretKey } = getOrCreateKeyPair();

  function decryptPreview(c: Conversation): string | null {
    const msg = c.messages?.[0];
    if (!msg) return null;
    if (msg.fileUrl) return '📎 Файл';
    const plaintext = decryptMessage(msg.encryptedContent, msg.nonce, c.clientPublicKey, secretKey);
    return plaintext;
  }

  function lastActivity(c: Conversation): string {
    return c.messages?.[0]?.timestamp || c.createdAt;
  }

  useEffect(() => {
    const socket = getOperatorSocket();

    socket.on('server:conversations', (convs: Conversation[]) => {
      setConversations(convs);
    });

    socket.on('server:new_conversation', (conv: any) => {
      setConversations((prev) => [
        ...prev,
        { ...conv, status: 'WAITING', operatorId: null, updatedAt: conv.createdAt, messages: [] },
      ]);
    });

    socket.on('server:message', (msg: Message) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === msg.conversationId ? { ...c, messages: [msg] } : c))
      );
    });

    socket.on(
      'server:conversation_claimed',
      ({ conversationId, operatorUsername }: { conversationId: string; operatorUsername: string }) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, status: 'ACTIVE', operator: { username: operatorUsername } }
              : c
          )
        );
      }
    );

    socket.on('server:conversation_closed', ({ conversationId }: { conversationId: string }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    });

    return () => {
      socket.off('server:conversations');
      socket.off('server:new_conversation');
      socket.off('server:message');
      socket.off('server:conversation_claimed');
      socket.off('server:conversation_closed');
    };
  }, []);

  function openConversation(c: Conversation) {
    if (c.status === 'WAITING') {
      getOperatorSocket().emit('operator:claim', { conversationId: c.id });
    }
    router.push(`/dashboard/${c.id}`);
  }

  const filtered = useMemo(
    () => (filter === 'ALL' ? conversations : conversations.filter((c) => c.department === filter)),
    [conversations, filter]
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(lastActivity(b)).getTime() - new Date(lastActivity(a)).getTime()
      ),
    [filtered] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const waitingCount = filtered.filter((c) => c.status === 'WAITING').length;

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: conversations.length };
    for (const d of ['SUPPORT', 'ORDERS', 'OTHER'] as Department[]) {
      map[d] = conversations.filter((c) => c.department === d).length;
    }
    return map;
  }, [conversations]);

  return (
    <main className="flex-1 p-4 md:p-8 overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-display text-xl text-bone">Разговори</h1>
        <p className="text-mist text-sm mt-1">
          {conversations.length} общо
          {waitingCount > 0 && <span className="text-ember"> · {waitingCount} чакащи</span>}
        </p>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        {DEPT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs font-display uppercase tracking-wider rounded-full px-3 py-1.5 border transition-colors ${
              filter === f.value
                ? 'border-signal text-signal bg-signal/10'
                : 'border-line text-mist hover:border-signal/40'
            }`}
          >
            {f.label} <span className="opacity-60">({counts[f.value] ?? 0})</span>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-mist text-sm">Все още няма разговори.</p>
          <p className="text-mist text-xs mt-1">
            Те ще се появят тук автоматично, щом някой напише.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((c) => {
            const name = c.clientLabel || `client_${c.id.slice(0, 8)}`;
            const preview = decryptPreview(c);
            const isWaiting = c.status === 'WAITING';

            return (
              <button
                key={c.id}
                onClick={() => openConversation(c)}
                className={`w-full text-left rounded-lg px-3 py-3 transition-colors flex items-center gap-3 border ${
                  isWaiting
                    ? 'bg-ember/5 border-ember/20 hover:border-ember/40'
                    : 'bg-panel border-line hover:border-signal/40'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-display text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: `${avatarColor(name)}22`, color: avatarColor(name) }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-display text-sm text-bone truncate">{name}</p>
                      <span className="text-[9px] font-display uppercase tracking-wider text-signal border border-signal/30 bg-signal/5 rounded-full px-1.5 py-0.5 flex-shrink-0">
                        {DEPARTMENT_LABELS[c.department] ?? c.department}
                      </span>
                    </div>
                    <span className="text-[10px] font-display text-mist flex-shrink-0">
                      {formatRelativeTime(lastActivity(c))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-mist text-xs truncate">
                      {preview !== null ? preview : isWaiting ? 'Нов разговор' : '[криптирано]'}
                    </p>
                    {isWaiting ? (
                      <span className="w-2 h-2 rounded-full bg-ember flex-shrink-0" />
                    ) : (
                      c.operator?.username && (
                        <span className="text-[10px] text-mist flex-shrink-0">
                          {c.operator.username}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
