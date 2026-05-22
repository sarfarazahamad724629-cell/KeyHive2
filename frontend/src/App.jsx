import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/parts/Sidebar';
import OverviewPage from './components/pages/OverviewPage';
import MasterKeysPage from './components/pages/MasterKeysPage';
import SubkeysPage from './components/pages/SubkeysPage';
import LogsPage from './components/pages/LogsPage';
import DemoPage from './components/pages/DemoPage';
import NotificationsPage from './components/pages/NotificationsPage';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'; // Override with VITE_API_URL when needed
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtNum = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n || 0));
const fmtTime = (ts) => (!ts ? '—' : new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
const fmtDate = (ts) => (!ts ? 'Never' : new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }));
const quotaColor = (used, limit) => (((used / limit) * 100 > 90) ? 'over' : ((used / limit) * 100 > 70) ? 'warn' : 'ok');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [page, setPage] = useState('overview');
  const [subkeys, setSubkeys] = useState([]);
  const [masterKeys, setMasterKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState({ totalRequests: 0, totalTokens: 0, avgLatency: '—', logs: [] });
  const [notif, setNotif] = useState({ show: false, msg: '', type: 'success' });
  const [modal, setModal] = useState('');
  const [revealedToken, setRevealedToken] = useState('—');

  const api = async (path, opts = {}) => {
    try {
      const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('Failed to fetch')) {
        throw new Error(`Cannot reach backend at ${API}. Make sure backend is running and VITE_API_URL is correct.`);
      }
      throw err;
    }
  };
  const notify = (msg, type = 'success') => { setNotif({ show: true, msg, type }); setTimeout(() => setNotif((v) => ({ ...v, show: false })), 3000); };
  const copyText = (text) => navigator.clipboard.writeText(text).then(() => notify('Copied to clipboard'));

  const loadOverview = async () => { const [sks, an] = await Promise.all([api('/api/subkeys'), api('/api/analytics')]); setSubkeys(sks); setLogs(an.logs || []); setAnalytics(an); };
  const loadMasterKeys = async () => setMasterKeys(await api('/api/master-keys'));
  const loadSubkeys = async () => setSubkeys(await api('/api/subkeys'));
  const loadLogs = async () => { const an = await api('/api/analytics'); setLogs(an.logs || []); setAnalytics(an); };

  const navigate = async (p) => { setPage(p); if (p === 'overview') await loadOverview(); if (p === 'masterkeys') await loadMasterKeys(); if (p === 'subkeys') await loadSubkeys(); if (p === 'logs') await loadLogs(); if (p === 'demo') await loadSubkeys(); if (p === 'notifications') await loadSubkeys(); };
  useEffect(() => { loadOverview().catch((e) => notify(e.message || 'Failed to load overview', 'error')); }, []);

  const ctx = useMemo(() => ({ API, esc, fmtNum, fmtTime, fmtDate, quotaColor, sleep, api, notify, copyText, modal, setModal, revealedToken, setRevealedToken, loadMasterKeys, loadSubkeys, loadLogs, loadOverview, subkeys, setSubkeys, masterKeys, logs, analytics, page }), [modal, subkeys, masterKeys, logs, analytics, revealedToken, page]);

  return <>
    <div className='app'>
      <Sidebar page={page} navigate={navigate} />
      <main className='main'>
        {page === 'overview' && <OverviewPage navigate={navigate} ctx={ctx} />}
        {page === 'masterkeys' && <MasterKeysPage ctx={ctx} />}
        {page === 'subkeys' && <SubkeysPage ctx={ctx} />}
        {page === 'logs' && <LogsPage ctx={ctx} />}
        {page === 'demo' && <DemoPage ctx={ctx} />}
        {page === 'notifications' && <NotificationsPage ctx={ctx} />}
      </main>
    </div>
    <div className={`notif ${notif.show ? 'show' : ''} ${notif.type}`}>{notif.msg}</div>
  </>;
}
