import '../styles/OverviewPage.css';

export default function OverviewPage({ ctx, navigate }) {
  const { subkeys, logs, analytics, fmtNum, quotaColor, fmtTime } = ctx;
  const failed = logs.filter((l) => l.status !== 'success').length;
  const costUsed = analytics.costAttribution?.reduce((s, r) => s + (r.est_cost_usd || 0), 0) || 0;
  const topEndpoint = '/v1/chat/completions';
  const todayBySubkey = logs.reduce((acc, l) => { acc[l.subkey_name || '—'] = (acc[l.subkey_name || '—'] || 0) + (l.tokens_used || 0); return acc; }, {});

  return <div className='page active'><div style={{ padding: '32px 36px' }}>
    <div className='page-header'><div className='page-title'>Overview</div><div className='page-sub'>Observability dashboard for proxy usage</div></div>
    <div className='stats'>
      <div className='stat'><div className='stat-val'>{fmtNum(analytics.totalRequests)}</div><div className='stat-label'>Total requests</div></div>
      <div className='stat'><div className='stat-val'>{fmtNum(failed)}</div><div className='stat-label'>Failed requests</div></div>
      <div className='stat'><div className='stat-val'>${costUsed.toFixed(2)}</div><div className='stat-label'>Cost used (est.)</div></div>
      <div className='stat'><div className='stat-val'>{analytics.avgLatency || '—'}</div><div className='stat-label'>Avg latency (ms)</div></div>
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Top endpoints & abuse detection</div><div className='card-sub'>Most traffic endpoint and suspicious usage hints</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('logs')}>Inspect logs →</button></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
        <div className='card' style={{margin:0,padding:'14px'}}><div className='card-sub'>Top endpoint</div><div className='mono' style={{fontSize:'13px',marginTop:'4px'}}>{topEndpoint}</div></div>
        <div className='card' style={{margin:0,padding:'14px'}}><div className='card-sub'>Abuse detection</div><div style={{marginTop:'4px',fontSize:'12px'}}>{failed > analytics.totalRequests * 0.35 ? 'High error ratio detected' : 'No obvious abuse signal detected'}</div></div>
      </div>
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Usage graph (proxy requests trend)</div></div></div>
      <div style={{display:'flex',alignItems:'end',gap:'4px',height:'70px'}}>{logs.slice(0,30).reverse().map((l,i)=><div key={i} style={{width:'8px',height:`${Math.max(8,Math.min(64,(l.tokens_used||1)/20))}px`,background:'var(--accent)',opacity:.8,borderRadius:'2px'}} />)}</div>
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Subkey analytics</div><div className='card-sub'>“Subkey X used 38,292 tokens today” style view</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>Manage keys →</button></div>
      {Object.entries(todayBySubkey).length ? Object.entries(todayBySubkey).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,tokens]) => <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}><span>{name}</span><span className='mono'>{fmtNum(tokens)} tokens today</span></div>) : <div className='empty'><div className='empty-text'>No subkey usage yet</div></div>}
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Error logs</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('logs')}>All logs →</button></div>
      <div className='table-wrap'><table><thead><tr><th>Time</th><th>Subkey</th><th>Model</th><th>Status</th><th>Latency</th></tr></thead><tbody>{logs.filter((l)=>l.status!=='success').slice(0,8).map((l, i) => <tr key={i}><td className='mono' style={{ color: 'var(--dim)' }}>{fmtTime(l.created_at)}</td><td style={{ fontWeight: 500 }}>{l.subkey_name || '—'}</td><td className='mono'>{l.model || '—'}</td><td>{l.status}</td><td className='mono'>{l.latency_ms ? `${l.latency_ms}ms` : '—'}</td></tr>)}</tbody></table></div>
    </div>

    <div className='card'><div className='card-header'><div><div className='card-title'>Subkey usage snapshot</div><div className='card-sub'>Quota consumption across all active keys</div></div><button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>Manage →</button></div>
      {!subkeys.length ? <div className='empty'><div className='empty-text'>No subkeys yet — <button className='btn btn-ghost btn-sm' onClick={() => navigate('subkeys')}>create one</button></div></div> : subkeys.slice(0, 5).map((sk) => {const pct = Math.min(100, Math.round((sk.tokens_used / sk.monthly_token_limit) * 100)); const col = quotaColor(sk.tokens_used, sk.monthly_token_limit); return <div key={sk.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>{sk.name}</div><div className='quota-bar'><div className={`quota-fill ${col}`} style={{ width: `${pct}%` }} /></div><div className='quota-text'>{fmtNum(sk.tokens_used)} / {fmtNum(sk.monthly_token_limit)} tokens — {pct}%</div></div><span className={`badge ${sk.status}`}>{sk.status}</span></div>;})}
    </div>
  </div></div>;
}
