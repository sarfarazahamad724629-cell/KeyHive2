# KeyGate — API Access Manager

> Share API access safely. Never share the actual key.

## What this is

KeyGate is a proxy gateway that lets you distribute scoped API access to employees, clients, or teams — without ever exposing your real OpenAI (or other provider) key.

- Clients get a `sk-kg-...` subkey
- They point their SDK at your gateway endpoint instead of api.openai.com
- Your real key is injected server-side, encrypted, and never returned
- Every request is logged with token usage, latency, and status
- You can pause or revoke any subkey instantly — without rotating the master key

---

## Quick start

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Start the backend
```bash
# From the keygate/ root:
bash start.sh

# Or directly:
cd backend && node server.js
```

The API runs on **http://localhost:3001**

### 3. Open the dashboard
Open `frontend/index.html` in your browser. No build step needed.

---

## Demo walkthrough (for investors)

1. **Master keys** → Add your OpenAI key. Watch it get masked immediately.
2. **Subkeys** → Create a subkey for "Demo Client" with a 1000 token limit.
3. **Copy the `sk-kg-...` token** — this is what your client gets.
4. **Live demo tab** → Select the subkey, run a test call. Watch it proxy through.
5. **Logs** → See the request tracked with tokens, latency, model.
6. **Revoke the subkey** → Run the same call again. Get a 403.
7. **Logs** → The master key usage is still tracked — you always know what happened.

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/master-keys | List provider keys (masked) |
| POST | /api/master-keys | Add/update a provider key |
| DELETE | /api/master-keys/:id | Remove a provider key |
| GET | /api/subkeys | List all subkeys |
| POST | /api/subkeys | Create a subkey |
| PATCH | /api/subkeys/:id | Update status/limits |
| DELETE | /api/subkeys/:id | Delete a subkey |
| GET | /api/analytics | Usage stats + request logs |
| POST | /v1/chat/completions | **The proxy endpoint** (use subkey as Bearer token) |

---

## How clients use it

Just change the base URL. Everything else is identical to the OpenAI SDK:

```python
# Before (dangerous — sharing real key)
client = OpenAI(api_key="sk-real-key...")

# After (safe — client only has a subkey)
client = OpenAI(
    api_key="sk-kg-YourSubkeyHere",
    base_url="https://your-keygate-domain.com"
)
```

```javascript
// Node.js
const openai = new OpenAI({
  apiKey: "sk-kg-YourSubkeyHere",
  baseURL: "http://localhost:3001"
});
```

```bash
# cURL
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-kg-YourSubkeyHere" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

---

## Architecture

```
Client (subkey)  →  KeyGate proxy  →  OpenAI API (master key)
                         |
                    ┌────┴────┐
                    │ Validate│  check token, status, expiry, quota
                    │ Enforce │  block if revoked / over quota
                    │ Inject  │  swap subkey → master key (server only)
                    │ Log     │  record tokens, latency, model, status
                    └─────────┘
```

---

## Stack

- **Backend**: Node.js + Fastify
- **Storage**: sql.js (in-memory SQLite — swap for Postgres in production)
- **Frontend**: Vanilla HTML/CSS/JS (zero dependencies, zero build step)
- **Encryption**: XOR + base64 (demo-grade; use AES-256 + KMS in production)

---

## Production checklist (post-MVP)

- [ ] Replace sql.js with Postgres + persistent volume
- [ ] Replace XOR encryption with AES-256-GCM + AWS KMS / HashiCorp Vault  
- [ ] Add Redis for rate limiting and quota counters
- [ ] Deploy proxy on edge (Cloudflare Workers / Fly.io) for low latency
- [ ] Add JWT auth to the dashboard
- [ ] Add Anthropic + Google adapters
- [ ] Stripe integration for billing per workspace
