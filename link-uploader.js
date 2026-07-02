#!/usr/bin/env node
/* Signal Proof — CSV upload page (Way 1, no command line needed).
 *
 * Run:  node link-uploader.js   ->  http://localhost:4060
 * Pick the Signal + Service for the campaign, drop your lead CSV in. It mints a
 * link per lead (each link carries the chosen service) and hands back a CSV with
 * `service` + `signal_link` columns to upload to PlusVibe.
 *
 * A per-row `service` column in the CSV overrides the dropdown for that row.
 * Runs on your machine only; leads go straight to the Supabase store.
 */
const http = require('http');
const { buildLinks, DEFAULT_BASE, SIGNALS } = require('./build-links');

const PORT = process.env.PORT || 4060;

// compact signal->services map for the browser (labels + keys only)
const SIG_MAP = Object.fromEntries(Object.entries(SIGNALS).map(([sk, s]) => [sk, {
  label: s.label || sk,
  defaultService: s.defaultService,
  services: Object.entries(s.services).map(([k, v]) => ({ key: k, label: v.label || k })),
}]));

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signal Proof — build links</title>
<style>
  :root{--gold:#c9a84c}
  *{box-sizing:border-box}
  body{margin:0;background:#0b0a09;color:#eee;font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{width:100%;max-width:560px;background:#121110;border:1px solid rgba(201,168,76,.28);border-radius:16px;padding:30px}
  h1{font-size:22px;margin:0 0 6px}
  p{color:#9b958a;margin:0 0 20px;font-size:14px}
  .row{display:flex;gap:12px;margin-bottom:16px}
  .row label{flex:1;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
  select{width:100%;margin-top:6px;padding:11px;background:#0e0d0c;color:#efeadd;border:1px solid rgba(201,168,76,.4);border-radius:9px;font-size:14px}
  .drop{display:block;border:2px dashed rgba(201,168,76,.4);border-radius:12px;padding:34px 20px;text-align:center;cursor:pointer;transition:.15s;background:#0e0d0c}
  .drop.over{border-color:var(--gold);background:rgba(201,168,76,.06)}
  .drop b{color:var(--gold)}
  #file{display:none}
  .name{margin-top:14px;font-size:13.5px;color:#efeadd}
  button{margin-top:18px;width:100%;padding:13px;font-size:15px;font-weight:700;background:var(--gold);color:#000;border:0;border-radius:9px;cursor:pointer}
  button:disabled{opacity:.45;cursor:default}
  .out{margin-top:20px;padding:16px;border-radius:10px;background:#0e0d0c;border:1px solid rgba(201,168,76,.28);display:none}
  .out.show{display:block}
  .stat{font-size:14px;color:#efeadd}.stat b{color:var(--gold)}
  .dl{display:inline-block;margin-top:12px;background:var(--gold);color:#000;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:8px}
  .err{color:#ef8a8a}
  code{background:#1a1917;padding:2px 6px;border-radius:5px;color:#d8c98f;font-size:13px}
  .hint{margin-top:16px;font-size:12.5px;color:#6b665d}
</style></head><body>
<div class="card">
  <h1>Build Signal Proof links</h1>
  <p>Pick the <b>signal</b> and the <b>service</b> this campaign targets, then drop your lead CSV. Each lead gets a link that shows them the right service version of the page.</p>
  <div class="row">
    <label>Signal<select id="signal"></select></label>
    <label>Service (who you're emailing)<select id="service"></select></label>
  </div>
  <label class="drop" id="drop">
    <div>Drag your CSV here or <b>click to choose</b></div>
    <input id="file" type="file" accept=".csv,text/csv">
    <div class="name" id="name"></div>
  </label>
  <button id="go" disabled>Build links</button>
  <div class="out" id="out"></div>
  <div class="hint">A <code>service</code> column in your CSV overrides the dropdown per row. Minting is free — a lead only costs anything when they open their link. Base URL: <code>${DEFAULT_BASE}</code></div>
</div>
<script>
  const SIG=${JSON.stringify(SIG_MAP)};
  const signalSel=document.getElementById('signal'), serviceSel=document.getElementById('service');
  const file=document.getElementById('file'), drop=document.getElementById('drop'), name=document.getElementById('name'), go=document.getElementById('go'), out=document.getElementById('out');
  for(const k in SIG){ const o=document.createElement('option'); o.value=k; o.textContent=SIG[k].label; signalSel.appendChild(o); }
  function fillServices(){ serviceSel.innerHTML=''; const s=SIG[signalSel.value]; for(const svc of s.services){ const o=document.createElement('option'); o.value=svc.key; o.textContent=svc.label; serviceSel.appendChild(o);} serviceSel.value=s.defaultService; }
  signalSel.onchange=fillServices; fillServices();
  let picked=null;
  function set(f){ if(!f) return; picked=f; name.textContent='📄 '+f.name; go.disabled=false; out.className='out'; }
  file.onchange=e=>set(e.target.files[0]);
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
  drop.ondragleave=()=>drop.classList.remove('over');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');set(e.dataTransfer.files[0]);};
  go.onclick=async()=>{
    if(!picked) return;
    go.disabled=true; go.textContent='Building…';
    const text=await picked.text();
    try{
      const r=await fetch('/process',{method:'POST',headers:{'content-type':'text/csv','x-filename':picked.name,'x-signal':signalSel.value,'x-service':serviceSel.value},body:text});
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'failed');
      const blob=new Blob([j.csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
      out.className='out show';
      out.innerHTML='<div class="stat"><b>'+j.minted+'</b> links minted for <b>'+j.service+'</b>'+(j.skipped?' &middot; <b>'+j.skipped+'</b> skipped (no email)':'')+'</div>'
        +'<a class="dl" href="'+url+'" download="'+j.outName+'">Download '+j.outName+'</a>'
        +'<div class="hint" style="margin-top:12px">Now upload that file to PlusVibe and use <code>{{signal_link}}</code> in your reply template.</div>';
    }catch(err){ out.className='out show'; out.innerHTML='<div class="stat err">Error: '+err.message+'</div>'; }
    go.disabled=false; go.textContent='Build links';
  };
</script></body></html>`;

http.createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  if (req.method === 'POST' && req.url === '/process') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const signal = req.headers['x-signal'] || undefined;
        const service = req.headers['x-service'] || undefined;
        const { csv, minted, skipped, service: usedService } = await buildLinks(body, { signal, service });
        const inName = (req.headers['x-filename'] || 'leads.csv').replace(/\.csv$/i, '');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, minted, skipped, csv, service: usedService, outName: `${inName}-${usedService || 'links'}.csv` }));
      } catch (e) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`\n  Signal Proof — link builder\n  → http://localhost:${PORT}\n`));
