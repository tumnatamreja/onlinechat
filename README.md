# GhostLine

Self-hosted, end-to-end encrypted live chat for talking to your clients —
no Telegram, no Signal, no third-party platforms. Just your server.

## Architecture

```
┌──────────────┐        WebSocket (Socket.IO)        ┌──────────────────┐
│   widget.js   │ ───────────────────────────────────▶│  GhostLine Server │
│ (any website) │◀─────────────────────────────────── │  (Express + WS)   │
└──────────────┘                                       └─────────┬─────────┘
                                                                   │
┌──────────────────┐        WebSocket (Socket.IO)                │
│  Operator Console │◀──────────────────────────────────────────┘
│   (Next.js app)   │
└──────────────────┘
                                                       ┌──────────────────┐
                                                       │   PostgreSQL      │
                                                       │ (ciphertext only) │
                                                       └──────────────────┘
```

- **server/** — Express + Socket.IO + Prisma/PostgreSQL. Routes encrypted
  messages between clients and operators. Stores only ciphertext, public
  keys, and encrypted file blobs. **It cannot read message content.**
- **operator/** — Next.js dashboard for support staff. Generates an X25519
  keypair on first login; the secret key never leaves the browser
  (localStorage).
- **client/** — A standalone, full-page chat (not a floating widget). Deploy
  it on its own subdomain (e.g. `chat.example.com`) and share that link with
  customers directly. Edit `client/public/config.js` to point it at your
  server — no rebuild needed.
- **widget/** — Optional embeddable `<script>` tag (floating bubble) for
  adding chat to an existing website. **⚠️ Legacy:** this was built before
  client accounts existed and does not yet implement the login/department
  flow the server now requires (`client:join` needs a JWT + department).
  Use `client/` for the primary deployment; the widget would need the same
  auth additions as `client/src/main.ts` before reuse.
- **shared/crypto.ts** — TweetNaCl `box` (X25519 + XSalsa20-Poly1305) helper,
  copied into `operator/`, `client/`, and `widget/`.

See **INSTALL.md** for full step-by-step deployment instructions (Bulgarian).

## How encryption works

1. On first use, both the client (visitor) and the operator generate an
   X25519 keypair locally. Secret keys **never leave the device/browser**.
2. Public keys are exchanged via the server when a conversation starts.
3. Every message/file is encrypted client-side with `nacl.box(plaintext,
   nonce, recipientPublicKey, mySecretKey)` before being sent.
4. The server stores/forwards `{ encryptedContent, nonce }` — it has no
   keys and cannot decrypt anything.
5. Files are encrypted as raw bytes before upload; the server stores an
   opaque `.enc` blob.

**Caveat (be upfront with your team about this):** because the operator's
secret key lives in browser localStorage, switching browsers/devices means
generating a *new* keypair — old conversation history encrypted to the old
key becomes unreadable on the new device unless you export/import the
keypair manually. For a small team, consider a shared "support" operator
account with a key you back up securely.

## Setup

### 1. Configure environment

```bash
cp server/.env.example server/.env
# edit server/.env — set a real JWT_SECRET and DB credentials
```

### 2. Run with Docker Compose

```bash
docker compose up -d --build
```

This starts PostgreSQL, the API server (port 4000), and the operator
console (port 3000).

### 3. Run migrations

```bash
docker compose exec server npx prisma migrate dev --name init
```

### 4. Create your first operator account

Visit `http://localhost:3000` — but you need an operator account first.
Easiest path:

1. Temporarily allow open registration: call
   `POST http://localhost:4000/api/auth/register` with
   `{ "username": "support", "password": "...", "publicKey": "..." }`
   while the operators table is empty (this is allowed once).
2. To get a real `publicKey`, open the operator console once
   (it'll generate a local keypair on first load — check
   localStorage `ghostline_operator_keypair` in devtools, or just
   register with a placeholder and update the key after first login
   via `PUT /api/auth/keypair`).

   Simplest: use `server/src/seed.ts` after generating a keypair via
   the browser console:
   ```js
   // in any browser console:
   const nacl = await import('https://esm.sh/tweetnacl');
   const kp = nacl.box.keyPair();
   console.log(btoa(String.fromCharCode(...kp.publicKey)));
   ```

3. `docker compose exec server npx ts-node src/seed.ts support YOUR_PASSWORD BASE64_PUBLIC_KEY`

### 5. Embed the widget on your site

Build it:

```bash
cd widget && npm install && npm run build
```

This produces `dist/ghostline-widget.js`. Host it on your server (e.g.
serve it as a static file) and embed:

```html
<script
  src="https://your-server.example/ghostline-widget.js"
  data-server="https://your-server.example:4000"
  data-label="Website Visitor"
  defer
></script>
```

A floating chat bubble appears in the bottom-right corner. Visitors don't
need to register — a keypair is generated and stored locally on first use.

## Operating it

- Operators log into `/` (the Next.js app), see a list of waiting chats,
  and click **Claim** to start responding.
- Messages decrypt in real time in the browser — the server logs/database
  only ever contain ciphertext.
- **Close chat** marks the conversation as closed; the client can no longer
  send messages in that session (a new session starts a new conversation).

## Production hardening checklist

- Put the server behind HTTPS (Nginx/Caddy + Let's Encrypt) — Socket.IO
  must run over `wss://` in production.
- Set a strong, random `JWT_SECRET`.
- Restrict `CORS_ORIGIN` to your actual website domain(s).
- Back up the PostgreSQL database — note that backups contain only
  ciphertext, public keys, and metadata (timestamps, conversation status).
- Rotate/rate-limit the `/api/upload` endpoint to prevent abuse.
- Consider running the operator console only on an internal network or
  behind additional auth (VPN, IP allowlist) since it's the support team's
  tool, not public-facing.
