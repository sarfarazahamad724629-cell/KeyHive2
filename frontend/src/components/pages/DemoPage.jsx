import { useEffect, useMemo, useState } from 'react';
import '../styles/DemoPage.css';

const PROVIDER_MODELS = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
};

export default function DemoPage({ ctx }) {
  const { subkeys, API, notify, sleep, copyText } = ctx;
  const [token, setToken] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [prompt, setPrompt] = useState('Say hello in exactly 5 words.');
  const [consoleLines, setConsoleLines] = useState(['# KeyGate live proxy demo', '# Select a subkey and hit "Run test call" to see the magic', 'ready — waiting for request']);

  const active = subkeys.filter((s) => s.status === 'active');
  const selectedSubkey = active.find((s) => s.token === token);

  const providerModelList = useMemo(() => {
    const provider = selectedSubkey?.provider || 'openai';
    return PROVIDER_MODELS[provider] || PROVIDER_MODELS.openai;
  }, [selectedSubkey]);

  const allowedModelList = useMemo(() => {
    if (!selectedSubkey) return PROVIDER_MODELS.openai;

    const providerDefaults = PROVIDER_MODELS[selectedSubkey.provider] || PROVIDER_MODELS.openai;
    if (!selectedSubkey.allowed_models || selectedSubkey.allowed_models === 'all') return providerDefaults;

    try {
      const allowed = JSON.parse(selectedSubkey.allowed_models);
      if (!Array.isArray(allowed) || !allowed.length || allowed.includes('all')) return providerDefaults;
      const filtered = allowed.filter((m) => providerDefaults.includes(m));
      return filtered.length ? filtered : providerDefaults;
    } catch {
      return providerDefaults;
    }
  }, [selectedSubkey]);

  useEffect(() => {
    if (!allowedModelList.includes(model)) setModel(allowedModelList[0] || 'gpt-4o-mini');
  }, [allowedModelList, model]);

  const preview = !token ? 'Select a subkey to see the request preview...' : `POST /v1/chat/completions\nAuthorization: Bearer ${token.slice(0, 12)}••••••\n\n{\n  "model": "${model}",\n  "messages": [{\n    "role": "user",\n    "content": "${prompt}"\n  }]\n}`;
  const add = (line) => setConsoleLines((v) => [...v, line]);

  const curlSnippet = `TOKEN="${token || 'sk-kg-YourTokenHere'}"\ncurl http://localhost:3001/v1/chat/completions \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"${prompt}"}]}'`;
  const jsSnippet = `fetch('http://localhost:3001/v1/chat/completions', {\n  method: 'POST',\n  headers: { Authorization: 'Bearer ${token || 'sk-kg-YourTokenHere'}', 'Content-Type': 'application/json' },\n  body: JSON.stringify({ model: '${model}', messages: [{ role: 'user', content: '${prompt}' }] })\n}).then(r => r.json()).then(console.log);`;
  const pySnippet = `import requests\nres = requests.post('http://localhost:3001/v1/chat/completions',\n  headers={'Authorization':'Bearer ${token || 'sk-kg-YourTokenHere'}','Content-Type':'application/json'},\n  json={'model':'${model}','messages':[{'role':'user','content':'${prompt}'}]})\nprint(res.json())`;

  const runDemo = async () => {
    if (!token) return notify('Select a subkey first', 'error');
    if (!prompt.trim()) return notify('Enter a prompt', 'error');
    if (!model) return notify('Select a model', 'error');
    setConsoleLines([`$ sending request with subkey ${token.slice(0, 16)}…`]);
    await sleep(250); add('→ validating subkey + model allowlist');
    await sleep(250); add(`→ model selected: ${model}`);
    try {
      const res = await fetch(API + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-keygate-client': 'dashboard', Authorization: 'Bearer ' + token }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 150 }) });
      const data = await res.json();
      if (!res.ok) { add(`✗ error ${res.status}: ${data.error?.message || 'unknown error'}`); return; }
      add(`✓ response received`); add(`→ tokens used: ${data.usage?.total_tokens || 0}`); add('AI response:'); add(data.choices?.[0]?.message?.content || ''); notify('Request proxied — check logs for usage');
    } catch (e) { add(`✗ connection error: ${e.message}`); }
  };

  const snippetCard = (title, code) => <div className='card' onClick={() => copyText(code)} style={{ cursor: 'pointer' }}><div className='card-title'>{title}</div><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'DM Mono, monospace', fontSize: '12px', marginTop: '8px' }}>{code}</pre></div>;

  return <div className='page active demo-page'><div style={{ padding: '32px 36px' }}><div className='page-header'><div className='page-title'>Live demo</div><div className='page-sub'>See exactly how a client uses a subkey — without ever knowing the real key</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
      <div className='card'><div className='card-header'><div className='card-title'>Configure test call</div></div>
        <div className='field'><label>Subkey to test</label><select value={token} onChange={(e) => setToken(e.target.value)}><option value=''>— select a subkey —</option>{active.map((s) => <option key={s.id} value={s.token}>{s.name}</option>)}</select></div>
        <div className='field'><label>Model</label><select value={model} onChange={(e) => setModel(e.target.value)}>{allowedModelList.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div className='field'><label>Prompt</label><input value={prompt} onChange={(e) => setPrompt(e.target.value)} /></div>
        <button className='btn btn-primary' style={{ width: '100%' }} onClick={runDemo}>Run test call →</button>
      </div>
      <div className='card' style={{ background: '#060609' }}><div className='card-title' style={{ color: 'var(--text)' }}>What the client sends</div><pre style={{ fontFamily: 'DM Mono, monospace', fontSize: '12px', color: 'var(--text)', lineHeight: 1.9, whiteSpace: 'pre-wrap', marginTop: '8px' }}>{preview}</pre></div>
    </div>
    <div className='console'><div className='console-bar'><div className='dot r' /><div className='dot y' /><div className='dot g' /><span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>KeyGate proxy console</span></div><div className='console-body'>{consoleLines.map((l, i) => <p key={i} className='console-line'>{l}</p>)}</div></div>
    <div className='snippet-grid' style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>{snippetCard('Auto-generated JS snippet (click to copy)', jsSnippet)}{snippetCard('Auto-generated Python snippet (click to copy)', pySnippet)}{snippetCard('Auto-generated cURL snippet (click to copy)', curlSnippet)}</div>
  </div></div>;
}
