// ─────────────────────────────────────────────────────────────
//  KeyGate Client Test
//  This is a completely separate project — no admin panel,
//  no special SDK. Just a subkey + your proxy endpoint.
//  This is EXACTLY how any client/employee would use it.
// ─────────────────────────────────────────────────────────────

const KEYGATE_PROXY  = 'http://localhost:3001';   // your KeyGate server
const SUBKEY_TOKEN   = 'sk-kg-kU1SumypbanntpERR3PZkKAHdD2HES7K'; // from the admin panel
const MODEL          = 'gpt-3.5-turbo';

// ── Core send function ────────────────────────────────────────
// Looks IDENTICAL to a normal OpenAI call — just a different base URL
async function askAI(userMessage) {
  const response = await fetch(`${KEYGATE_PROXY}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUBKEY_TOKEN}`,   // subkey, not the real key
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'user', content: userMessage }
      ],
      max_tokens: 200,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  return {
    reply:        data.choices[0].message.content,
    model:        data.model,
    tokens_used:  data.usage?.total_tokens || 0,
    prompt_tok:   data.usage?.prompt_tokens || 0,
    completion_tok: data.usage?.completion_tokens || 0,
  };
}

// ── UI helpers ────────────────────────────────────────────────
function log(msg, type = 'info') {
  const el = document.getElementById('log');
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status status-' + type;
}

// ── Send button handler ───────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('prompt');
  const prompt = input.value.trim();
  if (!prompt) return;

  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  log(`→ You: ${prompt}`, 'user');
  log(`→ Sending to ${KEYGATE_PROXY}/v1/chat/completions`, 'dim');
  log(`→ Using subkey: ${SUBKEY_TOKEN.slice(0, 14)}••••••`, 'dim');
  setStatus('Waiting for response...', 'loading');

  const t0 = Date.now();

  try {
    const result = await askAI(prompt);
    const latency = Date.now() - t0;

    log(`✓ AI: ${result.reply}`, 'success');
    log(`✓ Model: ${result.model} | Tokens: ${result.tokens_used} (${result.prompt_tok} prompt + ${result.completion_tok} completion) | Latency: ${latency}ms`, 'meta');
    setStatus(`✓ Success — ${result.tokens_used} tokens used in ${latency}ms`, 'success');

    input.value = '';
  } catch (err) {
    log(`✗ Error: ${err.message}`, 'error');
    setStatus(`✗ ${err.message}`, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Send →';
}

// ── Enter key support ─────────────────────────────────────────
document.getElementById('prompt').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── On load: show config ──────────────────────────────────────
window.addEventListener('load', () => {
  log(`KeyGate client test loaded`, 'dim');
  log(`Proxy endpoint : ${KEYGATE_PROXY}`, 'dim');
  log(`Subkey         : ${SUBKEY_TOKEN.slice(0, 14)}••••••`, 'dim');
  log(`Model          : ${MODEL}`, 'dim');
  log(`─────────────────────────────────────────`, 'dim');

  if (SUBKEY_TOKEN === 'PASTE_YOUR_SK_KG_TOKEN_HERE') {
    log('⚠ Paste your sk-kg-... token into client.js before testing!', 'warn');
    setStatus('⚠ Token not set — edit client.js', 'warn');
  } else {
    setStatus('Ready — type a message and hit Send', 'ready');
  }
});
