import { io, Socket } from 'socket.io-client';
import { styles } from './styles';
import { getOrCreateKeyPair, getSessionId, setSessionId } from './keychain';
import { encryptMessage, decryptMessage, decodeBase64 } from './crypto';
import nacl from 'tweetnacl';

interface GhostLineConfig {
  serverUrl: string;
  label?: string; // optional display name for the client
}

interface WireMessage {
  id: string;
  senderType: 'CLIENT' | 'OPERATOR';
  encryptedContent: string;
  nonce: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  timestamp: string;
}

function init(config: GhostLineConfig) {
  const { secretKey, publicKey } = getOrCreateKeyPair();
  let operatorPublicKey: string | null = null;
  let conversationId: string | null = null;
  let socket: Socket | null = null;
  let isOpen = false;

  // ── Inject styles ─────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ── Launcher button ───────────────────────────────────────────────────
  const launcher = document.createElement('div');
  launcher.className = 'gl-launcher';
  launcher.innerHTML = `<span class="gl-dot"></span>`;
  launcher.setAttribute('aria-label', 'Open secure chat');
  document.body.appendChild(launcher);

  // ── Panel ──────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'gl-panel gl-hidden';
  panel.innerHTML = `
    <div class="gl-header">
      <div class="gl-header-title"><span class="gl-dot"></span> secure channel</div>
      <button class="gl-close" aria-label="Close">×</button>
    </div>
    <div class="gl-status">connecting…</div>
    <div class="gl-messages"></div>
    <div class="gl-typing" style="display:none;">operator is typing…</div>
    <div class="gl-input-row">
      <input type="file" class="gl-file-input" style="display:none" />
      <button class="gl-attach" title="Attach file" aria-label="Attach file">📎</button>
      <input type="text" class="gl-input" placeholder="Type a message…" />
      <button class="gl-send" disabled>Send</button>
    </div>
    <div class="gl-footer">end-to-end encrypted · no third parties</div>
  `;
  document.body.appendChild(panel);

  const statusEl = panel.querySelector('.gl-status') as HTMLElement;
  const messagesEl = panel.querySelector('.gl-messages') as HTMLElement;
  const typingEl = panel.querySelector('.gl-typing') as HTMLElement;
  const inputEl = panel.querySelector('.gl-input') as HTMLInputElement;
  const sendBtn = panel.querySelector('.gl-send') as HTMLButtonElement;
  const closeBtn = panel.querySelector('.gl-close') as HTMLButtonElement;
  const attachBtn = panel.querySelector('.gl-attach') as HTMLButtonElement;
  const fileInput = panel.querySelector('.gl-file-input') as HTMLInputElement;

  function setStatus(text: string) {
    statusEl.textContent = text;
  }

  function updateSendState() {
    sendBtn.disabled = !inputEl.value.trim() || !operatorPublicKey;
    attachBtn.style.opacity = operatorPublicKey ? '1' : '0.4';
  }

  function appendMessage(msg: WireMessage, plaintext: string | null) {
    const div = document.createElement('div');
    div.className = `gl-msg ${msg.senderType === 'CLIENT' ? 'gl-msg-client' : 'gl-msg-operator'}`;

    if (msg.fileUrl) {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = `📎 ${plaintext || msg.fileName || 'encrypted file'} (decrypt & download)`;
      link.onclick = (e) => {
        e.preventDefault();
        downloadFile(msg);
      };
      div.appendChild(link);
    } else {
      div.appendChild(
        document.createTextNode(plaintext !== null ? plaintext : '[unable to decrypt]')
      );
    }

    const time = document.createElement('div');
    time.className = 'gl-msg-time';
    time.textContent = new Date(msg.timestamp).toLocaleTimeString();
    div.appendChild(time);

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function decryptFor(msg: WireMessage): string | null {
    if (!operatorPublicKey) return null;
    return decryptMessage(msg.encryptedContent, msg.nonce, operatorPublicKey, secretKey);
  }

  async function downloadFile(msg: WireMessage) {
    if (!msg.fileUrl || !operatorPublicKey) return;
    const res = await fetch(`${config.serverUrl}${msg.fileUrl}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const decrypted = nacl.box.open(
      buf,
      decodeBase64(msg.nonce),
      decodeBase64(operatorPublicKey),
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

  // ── Socket setup ──────────────────────────────────────────────────────
  function connect() {
    socket = io(`${config.serverUrl}/client`, { transports: ['websocket'] });

    socket.on('connect', () => {
      socket!.emit('client:join', {
        clientPublicKey: publicKey,
        sessionId: getSessionId() || undefined,
        label: config.label,
      });
    });

    socket.on(
      'server:joined',
      ({
        conversationId: convId,
        status,
        operatorPublicKey: opKey,
      }: {
        conversationId: string;
        status: string;
        operatorPublicKey: string | null;
      }) => {
        conversationId = convId;
        setSessionId(convId);
        operatorPublicKey = opKey;

        if (status === 'WAITING') {
          setStatus('waiting for an operator…');
        } else if (status === 'ACTIVE') {
          setStatus('connected — encrypted');
        }
        updateSendState();
      }
    );

    socket.on(
      'server:history',
      ({ messages }: { conversationId: string; messages: WireMessage[] }) => {
        messagesEl.innerHTML = '';
        messages.forEach((m) => appendMessage(m, decryptFor(m)));
      }
    );

    socket.on('server:operator_joined', ({ operatorPublicKey: opKey }: { operatorPublicKey: string }) => {
      operatorPublicKey = opKey;
      setStatus('connected — encrypted');
      updateSendState();
    });

    socket.on('server:message', (msg: WireMessage) => {
      appendMessage(msg, decryptFor(msg));
    });

    socket.on('server:typing', ({ typing }: { typing: boolean }) => {
      typingEl.style.display = typing ? 'block' : 'none';
    });

    socket.on('server:closed', () => {
      setStatus('conversation closed');
      operatorPublicKey = null;
      updateSendState();
    });

    socket.on('disconnect', () => setStatus('disconnected — retrying…'));
  }

  // ── Send message ──────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || !operatorPublicKey || !socket) return;
    const { encryptedContent, nonce } = encryptMessage(text, operatorPublicKey, secretKey);
    socket.emit('client:message', { encryptedContent, nonce });
    inputEl.value = '';
    updateSendState();
    notifyTyping(false);
  }

  let typingTimeout: ReturnType<typeof setTimeout>;
  function notifyTyping(typing: boolean) {
    socket?.emit('client:typing', { typing });
  }

  // ── File attach ──────────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!operatorPublicKey || !socket) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const nonceBytes = nacl.randomBytes(nacl.box.nonceLength);
    const encrypted = nacl.box(
      bytes,
      nonceBytes,
      decodeBase64(operatorPublicKey),
      decodeBase64(secretKey)
    );

    const form = new FormData();
    form.append('file', new Blob([encrypted.buffer as ArrayBuffer]), 'blob.enc');
    form.append('name', file.name);
    form.append('mime', file.type);

    const res = await fetch(`${config.serverUrl}/api/upload`, { method: 'POST', body: form });
    const { url, name, mime } = await res.json();

    const { encryptedContent, nonce } = encryptMessage(name, operatorPublicKey, secretKey);
    socket.emit('client:file', { encryptedContent, nonce, fileUrl: url, fileName: name, fileMime: mime });
  }

  // ── Wire up UI ─────────────────────────────────────────────────────────
  launcher.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('gl-hidden', !isOpen);
    if (isOpen && !socket) connect();
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    panel.classList.add('gl-hidden');
  });

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  inputEl.addEventListener('input', () => {
    updateSendState();
    notifyTyping(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => notifyTyping(false), 1200);
  });

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  updateSendState();
}

// ── Auto-init from script tag attributes ─────────────────────────────────
declare global {
  interface Window {
    GhostLine?: { init: typeof init };
  }
}

const currentScript = document.currentScript as HTMLScriptElement | null;
if (currentScript) {
  const serverUrl = currentScript.getAttribute('data-server');
  const label = currentScript.getAttribute('data-label') || undefined;
  if (serverUrl) {
    init({ serverUrl, label });
  }
}

window.GhostLine = { init };
