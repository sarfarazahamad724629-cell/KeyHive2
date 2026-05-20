import { useEffect, useState } from 'react';
import '../styles/SubkeysPage.css';

export default function SubkeysPage({ ctx }) {
  const { subkeys, api, loadSubkeys, notify, fmtNum, fmtDate, quotaColor, modal, setModal, setRevealedToken, revealedToken, copyText } = ctx;
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [limit, setLimit] = useState(50000);
  const [maxRequests, setMaxRequests] = useState(5000);
  const [spend, setSpend] = useState('');
  const [expiry, setExpiry] = useState('');
  const [models, setModels] = useState([]);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModels, setSelectedModels] = useState(['all']);

  useEffect(() => { api('/api/models').then((r) => setModels((r.data || []).map((m) => m.id))); }, []);

  const filteredModels = models.filter((m)=>m.toLowerCase().includes(modelSearch.toLowerCase()));

  const createSubkey = async () => {
    if (!name.trim()) return notify('Enter a name', 'error');
    const allowed_models = selectedModels.includes('all') ? ['all'] : selectedModels;
    const sk = await api('/api/subkeys', {
      method: 'POST',
      body: {
        name: name.trim(), provider,
        monthly_token_limit: Number(limit) || 50000,
        max_requests: Number(maxRequests) || 5000,
        allowed_models,
        spend_limit_usd: spend ? Number(spend) : null,
        expires_in_days: expiry ? Number(expiry) : null,
      }
    });
    if (sk.error) return notify(sk.error, 'error');
    setName(''); setProvider('openai'); setLimit(50000); setMaxRequests(5000); setSpend(''); setExpiry(''); setSelectedModels(['all']);
    setRevealedToken(sk.token); setModal('tokenreveal'); loadSubkeys();
  };

  return <div className='page active'><div style={{ padding: '32px 36px' }}><div className='page-header' style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}><div><div className='page-title'>Subkeys</div><div className='page-sub'>Scoped API tokens you distribute to employees, clients, or teams</div></div><button className='btn btn-primary' onClick={() => setModal('createsubkey')}>+ Create subkey</button></div>
    <div className='card' style={{ padding: 0 }}><div className='table-wrap'><table><thead><tr><th>Name</th><th>Token</th><th>Provider</th><th>Quota</th><th>Max req</th><th>Expires</th><th>Status</th></tr></thead><tbody>{!subkeys.length ? <tr><td colSpan='7' style={{ textAlign: 'center', color: 'var(--dim)', padding: '32px' }}>No subkeys yet — create one above</td></tr> : subkeys.map((sk) => {const pct = Math.min(100, Math.round((sk.tokens_used / sk.monthly_token_limit) * 100)); const col = quotaColor(sk.tokens_used, sk.monthly_token_limit); const masked = `${sk.token.slice(0, 12)}••••••••${sk.token.slice(-4)}`; return <tr key={sk.id}><td style={{ fontWeight: 500 }}>{sk.name}</td><td><div className='token-box' style={{ maxWidth: '200px' }}><span className='token-val'>{masked}</span><button className='token-copy' onClick={() => copyText(sk.token)}>copy</button></div></td><td><span style={{ fontSize: '12px', background: 'var(--bg3)', padding: '3px 8px', borderRadius: '4px', fontFamily: 'DM Mono, monospace' }}>{sk.provider}</span></td><td style={{ minWidth: '120px' }}><div className='quota-bar'><div className={`quota-fill ${col}`} style={{ width: `${pct}%` }} /></div><div className='quota-text'>{fmtNum(sk.tokens_used)} / {fmtNum(sk.monthly_token_limit)}</div></td><td className='mono'>{fmtNum(sk.request_count || 0)} / {fmtNum(sk.max_requests || 5000)}</td><td style={{ fontSize: '12px', color: 'var(--muted)' }}>{fmtDate(sk.expires_at)}</td><td><span className={`badge ${sk.status}`}>{sk.status}</span></td></tr>;})}</tbody></table></div></div>

    <div className={`modal-backdrop ${modal === 'createsubkey' ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal('')}><div className='modal'><div className='modal-title'>Create subkey</div><div className='form-row'><div className='field'><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. Client A — Frontend' /></div><div className='field'><label>Provider</label><select value={provider} onChange={(e) => setProvider(e.target.value)}><option value='openai'>OpenAI</option></select></div></div><div className='form-row'><div className='field'><label>Monthly token limit</label><input type='number' value={limit} onChange={(e) => setLimit(e.target.value)} min='100' /></div><div className='field'><label>Max allowed requests</label><input type='number' value={maxRequests} onChange={(e)=>setMaxRequests(e.target.value)} min='1' /></div></div><div className='form-row'><div className='field'><label>Global request rate</label><input value='10 req/min (global)' readOnly /></div><div className='field'><label>Spend ceiling (USD)</label><input type='number' value={spend} onChange={(e) => setSpend(e.target.value)} placeholder='Optional' min='0' step='0.01' /></div></div><div className='form-row single'><div className='field'><label>Expires in (days)</label><input type='number' value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder='Leave blank = never' /></div></div>
      <div className='form-row single'><div className='field'><label>Search model</label><input value={modelSearch} onChange={(e)=>setModelSearch(e.target.value)} placeholder='Search models...' /></div></div><div className='form-row single'><div className='field'><label>Allowed models</label><div style={{maxHeight:'180px',overflow:'auto',border:'1px solid var(--border)',padding:'8px',borderRadius:'6px'}}><label style={{display:'block',marginBottom:'6px'}}><input type='checkbox' checked={selectedModels.includes('all')} onChange={(e)=>setSelectedModels(e.target.checked?['all']:[])} /> all</label>{filteredModels.map((m)=><label key={m} style={{display:'block',marginBottom:'4px'}}><input type='checkbox' checked={selectedModels.includes('all')?false:selectedModels.includes(m)} disabled={selectedModels.includes('all')} onChange={(e)=>setSelectedModels((prev)=>e.target.checked?[...prev.filter(x=>x!=='all'),m]:prev.filter(x=>x!==m))} /> {m}</label>)}</div></div></div>
      <div className='modal-footer'><button className='btn btn-ghost' onClick={() => setModal('')}>Cancel</button><button className='btn btn-primary' onClick={createSubkey}>Generate subkey</button></div></div></div>

    <div className={`modal-backdrop ${modal === 'tokenreveal' ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && setModal('')}><div className='modal'><div className='modal-title'>Subkey created</div><div style={{ fontSize: '13px', color: 'var(--muted)' }}>Copy this token now. It won't be shown again in full.</div><div className='reveal-box'><div className='reveal-label'>Your subkey token</div><div className='reveal-token'>{revealedToken}</div></div><div className='reveal-warning'><span>⚠</span><span>This is shown once. Save it somewhere safe — your client will use this as their API key.</span></div><div className='modal-footer'><button className='btn btn-ghost' onClick={() => copyText(revealedToken)}>Copy token</button><button className='btn btn-primary' onClick={() => setModal('')}>Done</button></div></div></div>
  </div></div>;
}
