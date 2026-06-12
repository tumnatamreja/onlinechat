'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOperatorSocket } from '@/lib/socket';
import { Conversation, Department, DEPARTMENT_LABELS } from '@/lib/types';

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

  useEffect(() => {
    const socket = getOperatorSocket();

    socket.on('server:conversations', (convs: Conversation[]) => {
      setConversations(convs);
    });

    socket.on('server:new_conversation', (conv: any) => {
      setConversations((prev) => [
        ...prev,
        {
          ...conv,
          status: 'WAITING',
          operatorId: null,
          updatedAt: conv.createdAt,
          messages: [],
        },
      ]);
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
      socket.off('server:conversation_claimed');
      socket.off('server:conversation_closed');
    };
  }, []);

  function claim(id: string) {
    getOperatorSocket().emit('operator:claim', { conversationId: id });
    router.push(`/dashboard/${id}`);
  }

  const filtered = useMemo(
    () => (filter === 'ALL' ? conversations : conversations.filter((c) => c.department === filter)),
    [conversations, filter]
  );

  const waiting = filtered.filter((c) => c.status === 'WAITING');
  const active = filtered.filter((c) => c.status === 'ACTIVE');

  // Counts per department (for badge numbers), independent of active filter
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: conversations.length };
    for (const d of ['SUPPORT', 'ORDERS', 'OTHER'] as Department[]) {
      map[d] = conversations.filter((c) => c.department === d).length;
    }
    return map;
  }, [conversations]);

  return (
    <main className="flex-1 p-8 overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-display text-xl text-bone">Conversations</h1>
        <p className="text-mist text-sm mt-1">
          {waiting.length} waiting · {active.length} active
        </p>
      </header>

      <div className="flex gap-2 mb-8 flex-wrap">
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

      {waiting.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-xs uppercase tracking-[0.2em] text-ember mb-3">
            Waiting
          </h2>
          <div className="space-y-2">
            {waiting.map((c) => (
              <button
                key={c.id}
                onClick={() => claim(c.id)}
                className="w-full text-left bg-panel border border-line hover:border-ember/50 rounded-lg px-4 py-3 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm text-bone">
                      {c.clientLabel || `client_${c.id.slice(0, 8)}`}
                    </p>
                    <span className="text-[10px] font-display uppercase tracking-wider text-signal border border-signal/30 bg-signal/5 rounded-full px-2 py-0.5">
                      {DEPARTMENT_LABELS[c.department] ?? c.department}
                    </span>
                  </div>
                  <p className="text-mist text-xs mt-0.5">
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs font-display uppercase tracking-wider text-ember border border-ember/30 rounded px-2 py-1">
                  Claim
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-xs uppercase tracking-[0.2em] text-signal mb-3">
          Active
        </h2>
        {active.length === 0 ? (
          <p className="text-mist text-sm">No active conversations.</p>
        ) : (
          <div className="space-y-2">
            {active.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/dashboard/${c.id}`)}
                className="w-full text-left bg-panel border border-line hover:border-signal/50 rounded-lg px-4 py-3 transition-colors flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm text-bone">
                      {c.clientLabel || `client_${c.id.slice(0, 8)}`}
                    </p>
                    <span className="text-[10px] font-display uppercase tracking-wider text-signal border border-signal/30 bg-signal/5 rounded-full px-2 py-0.5">
                      {DEPARTMENT_LABELS[c.department] ?? c.department}
                    </span>
                  </div>
                  <p className="text-mist text-xs mt-0.5">
                    handled by {c.operator?.username || 'you'}
                  </p>
                </div>
                <span className="w-2 h-2 rounded-full bg-signal" />
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
