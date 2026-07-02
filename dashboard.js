#!/usr/bin/env node
/* Signal Proof — Signals & Services overview.
 *
 * Run:  node dashboard.js   ->  http://localhost:4070
 * Shows every SIGNAL (shared pool of enquiries) and the SERVICES running off it
 * (who we email + their page variation), with the live enquiry count and a
 * preview link per service. Read-only.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { SIGNALS } = require('./signals');

const PORT = process.env.PORT || 4070;
// where each signal's magnet is served (for preview links)
const PREVIEW = { sales: 'http://localhost:4050', 'office-moved': 'http://localhost:4051', 'office-moving-soon': 'http://localhost:4052' };

(function loadEnv() {
  const f = path.join(__dirname, '..', '..', 'intent-engine-marketing', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// count of gate-passing enquiries for a signal's client_id (via content-range)
function enquiryCount(clientId) {
  return new Promise((resolve) => {
    if (!SUPABASE_URL) return resolve(null);
    const u = new URL(SUPABASE_URL);
    const p = `/rest/v1/signals?client_id=eq.${clientId}&score=gte.70&select=id`;
    const r = https.request({ host: u.host, path: p, method: 'GET',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact', Range: '0-0' } },
      (res) => { const cr = res.headers['content-range'] || ''; res.on('data', () => {}); res.on('end', () => resolve(parseInt((cr.split('/')[1] || '0'), 10))); });
    r.on('error', () => resolve(null)); r.end();
  });
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function page() {
  const sigKeys = Object.keys(SIGNALS);
  const counts = {};
  await Promise.all(sigKeys.map(async (k) => { counts[k] = await enquiryCount(SIGNALS[k].clientId); }));

  const sections = sigKeys.map((sk) => {
    const s = SIGNALS[sk];
    const base = PREVIEW[sk] || '';
    const svc = Object.entries(s.services).map(([key, v]) => {
      const href = base ? `${base}/?to=Demo%20Business&from=Sam&service=${encodeURIComponent(key)}` : '#';
      return `<a class="svc" href="${href}" target="_blank" rel="noopener">
        <div class="svc-name">${esc(v.label || key)}</div>
        <div class="svc-aud">${esc(v.audience)}</div>
        <div class="svc-need">"…and need ${esc(v.needTail || 'exactly what you do')}"</div>
      </a>`;
    }).join('');
    const n = counts[sk];
    return `<section class="sig">
      <div class="sig-head">
        <div><div class="sig-name">${esc(s.label || sk)}</div><div class="sig-sub">signal · <code>${esc(sk)}</code></div></div>
        <div class="pool"><b>${n == null ? '—' : n}</b> live enquiries<span>shared by every service</span></div>
      </div>
      <div class="svc-grid">${svc}</div>
      <div class="sig-foot">${Object.keys(s.services).length} services · one scrape feeds them all${base ? '' : ' · <i>preview server not running</i>'}</div>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signal Proof — Signals & Services</title>
<style>
  :root{--gold:#c9a84c;--panel:#121110;--line:rgba(201,168,76,.28);--mut:#9b958a}
  *{box-sizing:border-box}
  body{margin:0;background:#0b0a09;color:#eee;font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:34px 20px 70px}
  .wrap{max-width:1000px;margin:0 auto}
  h1{font-size:26px;margin:0 0 4px}
  .lede{color:var(--mut);margin:0 0 28px;font-size:14.5px;max-width:680px}
  .lede b{color:#efeadd}
  .sig{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px}
  .sig-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;flex-wrap:wrap}
  .sig-name{font-size:19px;font-weight:700;color:#fff}
  .sig-sub{color:var(--mut);font-size:12.5px;margin-top:2px}.sig-sub code{color:#d8c98f}
  .pool{text-align:right;color:var(--gold);font-size:14px}.pool b{font-size:26px;display:inline-block;margin-right:6px}
  .pool span{display:block;color:var(--mut);font-size:11.5px}
  .svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
  .svc{display:block;text-decoration:none;background:#0e0d0c;border:1px solid var(--line);border-radius:11px;padding:14px;transition:.15s}
  .svc:hover{border-color:var(--gold);background:rgba(201,168,76,.06)}
  .svc-name{color:var(--gold);font-weight:700;font-size:14.5px;margin-bottom:4px}
  .svc-aud{color:#efeadd;font-size:12.5px;margin-bottom:8px}
  .svc-need{color:var(--mut);font-size:12px;font-style:italic}
  .sig-foot{margin-top:14px;color:var(--mut);font-size:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
  .key{color:var(--mut);font-size:13px;margin-bottom:24px}.key b{color:var(--gold)}
</style></head><body><div class="wrap">
  <h1>Signals &amp; Services</h1>
  <p class="lede">Each <b>signal</b> is one shared pool of <b>enquiries</b> (companies whose public announcement = a need), found once. Each <b>service</b> is a business we email who wants those enquiries — same leads, its own page wording. Click any service to preview its page.</p>
  ${sections}
</div></body></html>`;
}

http.createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await page()); }
  catch (e) { res.writeHead(500); res.end('error: ' + e.message); }
}).listen(PORT, () => console.log(`\n  Signal Proof — Signals & Services overview\n  → http://localhost:${PORT}\n`));
