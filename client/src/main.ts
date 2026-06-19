import { io, Socket } from 'socket.io-client';
import nacl from 'tweetnacl';
import { getOrCreateKeyPair } from './keychain';
import { encryptMessage, decryptMessage, decodeBase64 } from './crypto';
import { getToken, setAuth, getUsername, clearAuth, login, register } from './auth';

declare global {
  interface Window {
    GHOSTLINE_CONFIG?: { serverUrl: string; label?: string };
  }
}

type Department = 'SUPPORT' | 'ORDERS' | 'OTHER';

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

const config = window.GHOSTLINE_CONFIG;
if (!config?.serverUrl) {
  document.body.innerHTML =
    '<p style="color:#E9EDF3;font-family:monospace;padding:24px;">' +
    'Missing configuration. Edit <code>config.js</code> and set <code>serverUrl</code>.' +
    '</p>';
  throw new Error('GHOSTLINE_CONFIG.serverUrl is required');
}
const serverUrl = config.serverUrl.trim().replace(/\/+$/, '');

const { secretKey, publicKey } = getOrCreateKeyPair();
let operatorPublicKey: string | null = null;
let socket: Socket | null = null;

// ── Elements ───────────────────────────────────────────────────────────
const operatorStatusEl = document.getElementById('operatorStatus')!;
const operatorStatusTextEl = document.getElementById('operatorStatusText')!;
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;

const authScreen = document.getElementById('authScreen')!;
const deptScreen = document.getElementById('deptScreen')!;
const chatScreen = document.getElementById('chatScreen')!;

const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const registerForm = document.getElementById('registerForm') as HTMLFormElement;
const authError = document.getElementById('authError')!;
const tabs = document.querySelectorAll<HTMLButtonElement>('.gl-tab');

const messagesEl = document.getElementById('messages')!;
const typingEl = document.getElementById('typing')!;
const inputEl = document.getElementById('textInput') as HTMLInputElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const attachBtn = document.getElementById('attachBtn') as HTMLButtonElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

// ── Screen switching ──────────────────────────────────────────────────
type Screen = 'auth' | 'department' | 'chat';
function showScreen(screen: Screen) {
  authScreen.style.display = screen === 'auth' ? 'flex' : 'none';
  deptScreen.style.display = screen === 'department' ? 'flex' : 'none';
  chatScreen.style.display = screen === 'chat' ? 'flex' : 'none';
  logoutBtn.style.display = screen === 'auth' ? 'none' : 'inline-flex';
}

// ── Operator presence pill ────────────────────────────────────────────
function setOperatorStatus(online: boolean | null) {
  operatorStatusEl.classList.remove('online', 'offline');
  if (online === null) {
    operatorStatusTextEl.textContent = 'проверка…';
  } else if (online) {
    operatorStatusEl.classList.add('online');
    operatorStatusTextEl.textContent = 'оператор онлайн';
  } else {
    operatorStatusEl.classList.add('offline');
    operatorStatusTextEl.textContent = 'няма оператор онлайн';
  }
}

// ── Auth UI ────────────────────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    loginForm.style.display = isLogin ? 'flex' : 'none';
    registerForm.style.display = isLogin ? 'none' : 'flex';
    authError.textContent = '';
  });
});

loginForm.addEventListener('submit', async (e) => { e.preventDefault(); await doLogin(); });
document.getElementById('loginBtn')!.addEventListener('click', doLogin);

registerForm.addEventListener('submit', async (e) => { e.preventDefault(); await doRegister(); });
document.getElementById('registerBtn')!.addEventListener('click', doRegister);

async function doLogin() {
  authError.textContent = '';
  const username = (document.getElementById('loginUsername') as HTMLInputElement).value.trim();
  const password = (document.getElementById('loginPassword') as HTMLInputElement).value;
  if (!username || !password) { authError.textContent = 'Попълни потребителско ime и парола'; return; }
  try {
    const { token, account } = await login(serverUrl, username, password);
    setAuth(token, account.username);
    showScreen('department');
  } catch (err: any) {
    console.error('Login error:', err);
    authError.textContent = `${err.name || 'Error'}: ${err.message || err}`;
  }
}

async function doRegister() {
  authError.textContent = '';
  const username = (document.getElementById('registerUsername') as HTMLInputElement).value.trim();
  const password = (document.getElementById('registerPassword') as HTMLInputElement).value;
  if (!username || !password) { authError.textContent = 'Попълни потребителско ime и парола'; return; }
  if (password.length < 6) { authError.textContent = 'Паролата трябва да е поне 6 символа'; return; }
  try {
    const { token, account } = await register(serverUrl, username, password);
    setAuth(token, account.username);
    showScreen('department');
  } catch (err: any) {
    console.error('Register error:', err);
    authError.textContent = `${err.name || 'Error'}: ${err.message || err}`;
  }
}

logoutBtn.addEventListener('click', () => {
  clearAuth();
  socket?.disconnect();
  socket = null;
  operatorPublicKey = null;
  messagesEl.innerHTML = '';
  updateSendState();
  showScreen('auth');
});

// ── Department picker ─────────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.gl-dept-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const dept = btn.dataset.dept as Department;
    showScreen('chat');
    connectAndJoin(dept);
  });
});

// ── Chat helpers ───────────────────────────────────────────────────────
function updateSendState() {
  sendBtn.disabled = !inputEl.value.trim() || !operatorPublicKey;
  attachBtn.disabled = !operatorPublicKey;
}

function appendSystemMessage(text: string) {
  const div = document.createElement('div');
  div.className = 'gl-msg gl-msg-system';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage(msg: WireMessage, plaintext: string | null) {
  const div = document.createElement('div');
  div.className = `gl-msg ${msg.senderType === 'CLIENT' ? 'gl-msg-client' : 'gl-msg-operator'}`;

  if (msg.fileUrl) {
    const btn = document.createElement('button');
    btn.className = 'gl-file-link';
    btn.textContent = `📎 ${plaintext || msg.fileName || 'encrypted file'} (decrypt & download)`;
    btn.onclick = () => downloadFile(msg);
    div.appendChild(btn);
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
  const res = await fetch(`${serverUrl}${msg.fileUrl}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const decrypted = nacl.box.open(
    buf,
    decodeBase64(msg.nonce),
    decodeBase64(operatorPublicKey),
    decodeBase64(secretKey)
  );
  if (!decrypted) {
    alert('Грешка при декриптиране на файла.');
    return;
  }
  const blob = new Blob([decrypted.buffer as ArrayBuffer], {
    type: msg.fileMime || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = msg.fileName || 'file';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Socket setup ───────────────────────────────────────────────────────
function connectSocketForStatus() {
  if (socket) return;
  socket = io(`${serverUrl}/client`, { transports: ['websocket'] });
  registerSocketHandlers();
}

function connectAndJoin(department: Department) {
  const token = getToken();
  if (!token) {
    showScreen('auth');
    return;
  }

  if (!socket) {
    socket = io(`${serverUrl}/client`, { transports: ['websocket'] });
    registerSocketHandlers();
  }

  const join = () => {
    socket!.emit('client:join', {
      token,
      clientPublicKey: publicKey,
      department,
      label: config!.label || getUsername() || undefined,
    });
  };

  if (socket.connected) join();
  else socket.once('connect', join);
}

function registerSocketHandlers() {
  if (!socket) return;

  socket.on('connect', () => {
    setOperatorStatus(null);
  });

  socket.on('server:operator_status', ({ online }: { online: boolean }) => {
    setOperatorStatus(online);
  });

  socket.on(
    'server:joined',
    ({
      status,
      operatorPublicKey: opKey,
    }: {
      conversationId: string;
      status: string;
      department: Department;
      operatorPublicKey: string | null;
    }) => {
      operatorPublicKey = opKey;

      if (status === 'WAITING') {
        appendSystemMessage('Свързахте се със защитен канал. Изчакваме оператор.');
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
    appendSystemMessage('Оператор се присъедини към разговора.');
    updateSendState();
  });

  socket.on('server:message', (msg: WireMessage) => {
    appendMessage(msg, decryptFor(msg));
  });

  socket.on('server:typing', ({ typing }: { typing: boolean }) => {
    typingEl.style.display = typing ? 'block' : 'none';
  });

  socket.on('server:closed', () => {
    appendSystemMessage('Операторът приключи разговора.');
    operatorPublicKey = null;
    updateSendState();
  });

  socket.on('server:error', ({ message }: { message: string }) => {
    if (message === 'AUTH_REQUIRED') {
      clearAuth();
      showScreen('auth');
    }
  });

  socket.on('disconnect', () => setOperatorStatus(null));
}

// ── Send message ───────────────────────────────────────────────────────
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

// ── File attach ───────────────────────────────────────────────────────
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

  const res = await fetch(`${serverUrl}/api/upload`, { method: 'POST', body: form });
  const { url, name, mime } = await res.json();

  const { encryptedContent, nonce } = encryptMessage(name, operatorPublicKey, secretKey);
  socket.emit('client:file', { encryptedContent, nonce, fileUrl: url, fileName: name, fileMime: mime });
}

// ── Wire up UI ─────────────────────────────────────────────────────────
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

// ── Boot ───────────────────────────────────────────────────────────────
updateSendState();
connectSocketForStatus();

if (getToken()) {
  // Returning user — skip auth, go straight to department picker.
  // If they already have an open conversation, the server resumes it
  // regardless of which department button is pressed first, so show
  // the picker only briefly; a saved conversation resumes on join.
  showScreen('department');
} else {
  showScreen('auth');
}
