const AVATAR_COLORS = [
  '#5EE6A8', '#FF6B4A', '#7AA2F7', '#E0AF68', '#BB9AF7', '#73DACA',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'сега';
  if (diffMin < 60) return `${diffMin} мин`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'вчера';
  if (diffD < 7) return `${diffD} дни`;
  return date.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short' });
}
