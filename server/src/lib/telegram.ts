/**
 * Sends a plain-text notification to one or more Telegram admins.
 *
 * IMPORTANT: GhostLine messages are end-to-end encrypted — the server
 * never has access to plaintext. These notifications can only ever say
 * "something happened" (new chat, new message in a waiting chat), never
 * what was said.
 *
 * Setup:
 * 1. Create a bot via @BotFather, copy the token into TELEGRAM_BOT_TOKEN.
 * 2. Message your bot (or add it to a group) and get the chat id, e.g. via
 *    https://api.telegram.org/bot<token>/getUpdates
 * 3. Put one or more comma-separated chat ids into TELEGRAM_ADMIN_CHAT_IDS.
 */

const TELEGRAM_API = 'https://api.telegram.org';

export async function notifyTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const rawIds = process.env.TELEGRAM_ADMIN_CHAT_IDS;

  if (!token || !rawIds) return; // not configured — silently no-op

  const chatIds = rawIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  await Promise.all(
    chatIds.map((chatId) =>
      fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      }).catch((err) => {
        console.error('[telegram] notification failed:', err.message);
      })
    )
  );
}

export const DEPARTMENT_LABELS: Record<string, string> = {
  SUPPORT: 'Поддръжка',
  ORDERS: 'Поръчки',
  OTHER: 'Друго',
};
