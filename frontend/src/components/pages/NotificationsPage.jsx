import { useEffect, useState } from 'react';
import '../styles/LogsPage.css';

export default function NotificationsPage({ ctx }) {
  const { subkeys, fmtNum, fmtDate, api, notify } = ctx;
  const [requests, setRequests] = useState([]);
  useEffect(() => { api('/api/quota-requests').then(setRequests); }, []);

  const nearLimit = subkeys.filter((s) => (Number(s.tokens_used || 0) / Number(s.monthly_token_limit || 1)) >= 0.8);
  const expiring = subkeys.filter((s) => s.expires_at && (Number(s.expires_at) - Math.floor(Date.now()/1000)) < 7*86400);

  const ask = async (id, type, amount, note='') => { await api('/api/quota-requests', { method:'POST', body:{ subkey_id:id, request_type:type, amount, note } }); notify('Request submitted'); setRequests(await api('/api/quota-requests')); };

  return <div className='page active'><div style={{padding:'32px 36px'}}><div className='page-header'><div className='page-title'>Notifications</div><div className='page-sub'>Quota alerts, expiry alerts, and extension requests.</div></div>
    <div className='card'><div className='card-title'>Near limit</div>{nearLimit.length?nearLimit.map(s=><div key={s.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>{s.name} is near limit ({fmtNum(s.tokens_used)} / {fmtNum(s.monthly_token_limit)})</div>):<div className='empty-text'>No near-limit alerts.</div>}</div>
    <div className='card'><div className='card-title'>Expiring soon</div>{expiring.length?expiring.map(s=><div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}><span>{s.name} expires on {fmtDate(s.expires_at)}</span><button className='btn btn-amber btn-sm' onClick={()=>ask(s.id,'expiry_extend','7 days','Auto request from notifications')}>Extend Lifespan?</button></div>):<div className='empty-text'>No expiring subkeys.</div>}</div>
    <div className='card'><div className='card-title'>Quota extension requests</div>{requests.length?requests.map(r=><div key={r.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>[{r.subkey_name}] asked for {r.request_type} {r.amount ? `(${r.amount})` : ''} — <span className='mono'>{r.status}</span></div>):<div className='empty-text'>No quota requests yet.</div>}</div>
    <div className='card'><div className='card-title'>Quick request</div><div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>{subkeys.slice(0,5).map(s=><button key={s.id} className='btn btn-ghost btn-sm' onClick={()=>ask(s.id,'credits','$20')}>{s.name}: ask +$20 credits</button>)}</div></div>
  </div></div>;
}
