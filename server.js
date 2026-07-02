#!/usr/bin/env node
/* Signal Proof — MAGNET landing page.
 * Pure Node (no install). Reads gate-passing signals from the marketing twin DB,
 * drafts an opener per card with Haiku, renders the 3-card reverse lead magnet.
 *
 * Reads creds from ../../intent-engine-marketing/.env (twin Supabase + Anthropic).
 * Run:  node server.js   → http://localhost:4050
 *   Personalise: http://localhost:4050/?to=Acme%20Sales%20Coaching&for=B2B%20founders
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 4050;
const MODEL = 'claude-haiku-4-5';
// ── SIGNAL → SERVICES config: single source of truth in signals.js ──
const { SIGNALS } = require("./signals");
// Signal resolved PER REQUEST (from ?signal=, the token, or the Host subdomain)
// so ONE deploy serves every shelf. Falls back to this default, which keeps the
// live sales page working unchanged when no signal is specified.
const DEFAULT_SIGNAL = SIGNALS[process.env.SIGNAL] ? process.env.SIGNAL : 'sales';
const SUBDOMAIN_SIGNAL = { moved: 'office-moved', soon: 'office-moving-soon', signals: DEFAULT_SIGNAL };
const sigCfg = (k) => SIGNALS[k] || SIGNALS[DEFAULT_SIGNAL];
const resolveSignal = (k) => (SIGNALS[k] ? k : DEFAULT_SIGNAL);
const resolveService = (sigKey, k) => { const s = sigCfg(sigKey); return k && s.services[k] ? k : s.defaultService; };
const TOKEN_ONLY = process.env.TOKEN_ONLY === 'true'; // live URL: only known tokens run the paid build
const BASE_URL = process.env.MAGNET_BASE_URL || `http://localhost:${PORT}`;

// ── load twin .env ────────────────────────────────────────────────────
(function loadEnv() {
  const f = path.join(__dirname, '..', '..', 'intent-engine-marketing', '.env');
  if (!fs.existsSync(f)) { console.error('twin .env not found at', f); return; }
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FINDYMAIL_KEY = process.env.FINDYMAIL_API_KEY;
// Gated admin console (overview + CSV link-minting), served at /console?key=…
const { buildLinks } = require('./build-links');
const CONSOLE_KEY = process.env.CONSOLE_KEY || require('crypto').createHash('sha256').update((SUPABASE_KEY || 'x') + 'signal-proof-console').digest('hex').slice(0, 20);
const emailCache = new Map(); // linkedin_url -> email (persisted; a lead is only ever looked up once)
// Prospect token store. Production: a magnet_prospects DB table, token minted when added to a campaign.
const PROSPECTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'prospects.json'), 'utf8')); } catch (e) { return {}; } })();
// Persist found emails across restarts so Findymail is charged ONCE per lead, ever.
const EMAIL_FILE = path.join(__dirname, 'emails.json');
(() => { try { const o = JSON.parse(fs.readFileSync(EMAIL_FILE, 'utf8')); for (const k in o) emailCache.set(k, o[k]); } catch (e) {} })();
function saveEmails() { try { fs.writeFileSync(EMAIL_FILE, JSON.stringify(Object.fromEntries(emailCache))); } catch (e) {} }

// ── tiny https helpers ────────────────────────────────────────────────
function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => (res.statusCode >= 300 ? reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`)) : resolve(buf)));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
// Prospect lookup: Supabase magnet_prospects table in prod; falls back to the
// local prospects.json for dev or if the table/DB is unreachable.
async function getProspect(token) {
  if (!token) return null;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const host = new URL(SUPABASE_URL).host;
      const p = `/rest/v1/magnet_prospects?token=eq.${encodeURIComponent(token)}&select=*&limit=1`;
      const out = await req({ host, path: p, method: 'GET', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const row = JSON.parse(out)[0];
      if (row) return row;
    } catch (e) { /* table missing or DB down: fall through to local file */ }
  }
  return PROSPECTS[token] || null;
}

async function supabaseSignals(clientId) {
  const host = new URL(SUPABASE_URL).host;
  const cols = 'name,headline,company,location,post_text,post_url,posted_at,created_at,source,pain_type,linkedin_url,score,awareness_stage,image_url';
  const p = `/rest/v1/signals?client_id=eq.${clientId}&score=gte.70&select=${cols}&order=score.desc`;
  const out = await req({ host, path: p, method: 'GET', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  return JSON.parse(out);
}
async function haiku(prompt, max = 80, model = MODEL) {
  const body = JSON.stringify({ model, max_tokens: max, messages: [{ role: 'user', content: prompt }] });
  const out = await req({ host: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' } }, body);
  const j = JSON.parse(out);
  return (j.content || []).find((b) => b.type === 'text')?.text?.trim() || '';
}
// Findymail: real verified email from a LinkedIn profile URL (no guessing). Cached.
async function findymailLookup(linkedinUrl, name, company) {
  if (!FINDYMAIL_KEY || (!linkedinUrl && !name)) return null;
  const key = linkedinUrl || `${name}|${company}`;
  if (emailCache.has(key)) return emailCache.get(key);
  const body = JSON.stringify(linkedinUrl ? { linkedin_url: linkedinUrl } : { name, domain: (company || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com' });
  const path = linkedinUrl ? '/api/search/linkedin' : '/api/search/name';
  try {
    const out = await req({ host: 'app.findymail.com', path, method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'content-length': Buffer.byteLength(body), Authorization: `Bearer ${FINDYMAIL_KEY}` } }, body);
    const email = JSON.parse(out)?.contact?.email || null;
    emailCache.set(key, email); saveEmails(); // persist so this lead is never re-looked-up (incl. null = no-match)
    return email;
  } catch (e) { emailCache.set(key, null); saveEmails(); return null; }
}
// (Phone enrichment via BetterContact removed for now — too credit-hungry. Email only.)

// ── card selection: fresh, dedupe author, prefer named (Twitter) sources ──
const UK_RE = /\bLondon\b|Manchester|Birmingham|Leeds|Bristol|Glasgow|Edinburgh|Cardiff|Liverpool|Sheffield|Nottingham|United Kingdom|\bU\.?K\.?\b|England|Scotland|Wales|Britain|\bGB\b/i;
const isUK = (r) => UK_RE.test(`${r.location || ''} ${r.headline || ''} ${r.company || ''} ${r.post_text || ''}`);

function selectCards(rows, limit = 3, freshDays = 14) {
  const now = Date.now(), freshMs = freshDays * 86400000;
  let fresh = rows.filter((r) => new Date(r.posted_at || r.created_at).getTime() >= now - freshMs);
  if (process.env.UK_ONLY !== 'false') fresh = fresh.filter(isUK); // UK-based companies only
  // rank: score first, then named-company source (LinkedIn hires are the most showable), then recency
  const srcRank = { linkedin_posts: 2, twitter: 1, reddit: 0 };
  const rank = (r) => (r.score || 0) * 10 + (srcRank[r.source] || 0);
  fresh.sort((a, b) => rank(b) - rank(a) || new Date(b.posted_at || b.created_at) - new Date(a.posted_at || a.created_at));
  const seen = new Set(), picked = [];
  for (const r of fresh) {
    const who = (r.linkedin_url || r.name || '').toLowerCase();
    if (who && seen.has(who)) continue;
    seen.add(who);
    picked.push(r);
    if (picked.length === limit) break;
  }
  return picked;
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (d) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const sourceLabel = (s) => ({ twitter: 'X / Twitter', reddit: 'Reddit', linkedin_posts: 'LinkedIn' }[s] || s);

const stripDashes = (s = '') => String(s).replace(/\s*[—–]\s*/g, ', ').replace(/[—–]/g, '-').replace(/,\s*,/g, ',');

// Illustrative email (name@domain) when Findymail finds no verified address — so a
// card can still be shown for demo/illustration. Labelled "likely", never "verified".
function illustrativeDomain(c) {
  const i = c._intel || {};
  let d = String(i.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim().toLowerCase();
  const toSlug = (x) => String(x).toLowerCase().replace(/&/g, ' and ').replace(/\b(ltd|limited|llp|plc|inc|group|uk)\b/g, '').replace(/[^a-z0-9]+/g, '');
  if (!d) { const co = i.company || c.company; if (co) { const slug = toSlug(co); if (slug.length >= 3) d = slug + '.co.uk'; } }
  if (!d && c.name) { const slug = toSlug(c.name); if (slug.length >= 3 && slug.length <= 30) d = slug + '.co.uk'; } // last resort so we can still illustrate
  return d && /^[a-z0-9-]+(\.[a-z0-9-]+)+\.[a-z]{2,}$|^[a-z0-9-]+\.[a-z]{2,}$/.test(d) ? d : null;
}
function illustrativeLocal(name) {
  const n = String(name || '').trim();
  if (!n || /\b(ltd|limited|llp|plc|group|solutions|services|aggregates|recruitment|software|systems|consult|company|marketing|associates|partners|holdings)\b/i.test(n)) return 'info';
  const parts = n.split(/[\s.\-–]+/).map((p) => p.toLowerCase().replace(/[^a-z]/g, '')).filter((p) => p.length >= 2 && !/^(the|and|dr|mr|mrs|ms)$/.test(p));
  if (parts.length >= 2) return parts[0] + '.' + parts[1]; // firstname.lastname@domain
  return parts[0] || 'info';
}

// ── SHARED base cards (identical for every prospect): lead selection + verified
// email + company intel. Built ONCE and cached globally (prewarmed at startup),
// so a prospect page never pays for this. Only the per-prospect emails are
// generated on demand — that's what keeps first paint fast.
const baseCache = new Map(); // sigKey -> { cards, exp }
const basePromise = new Map(); // sigKey -> Promise (coalesce concurrent builds)
async function getBaseCards(sigKey) {
  const s = sigCfg(sigKey);
  const hit = baseCache.get(sigKey);
  if (hit && hit.exp > Date.now()) return hit.cards;
  if (basePromise.has(sigKey)) return basePromise.get(sigKey);
  const pr = (async () => {
    try {
      const rows = await supabaseSignals(s.clientId);
      const pool = selectCards(rows, 14, s.freshDays).slice(0, 8); // UK already enforced in selectCards
      // Intel FIRST (one Haiku call) so we have company + website for illustrative emails.
      try {
        const prompt = `For each ${s.intelNoun} below, extract facts about the company. Use ONLY what is explicitly stated or clearly evident; NEVER invent; use null if unknown.

${pool.map((c, i) => `[${i + 1}] Author: ${c.name || ''}; Headline: ${c.headline || ''}; Post: """${(c.post_text || '').slice(0, 600)}"""`).join('\n\n')}

Return ONLY a JSON array of ${pool.length} objects, in the same order: [{"company":..,"location":..,"industry":..,"company_size":..,"role_hiring":..,"website":..,"email":..}]`;
        const raw = await haiku(prompt, 900, MODEL);
        const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)[0]);
        pool.forEach((c, i) => { c._intel = arr[i] || {}; });
      } catch (e) { pool.forEach((c) => { c._intel = c._intel || {}; }); }
      // Verified email via Findymail; else an illustrative name@domain so we can still show the card.
      const picked = [];
      let lookups = 0;
      for (const c of pool) {
        if (picked.length >= 4) break;
        let email = null;
        if (lookups < 10) { email = await findymailLookup(c.linkedin_url, c.name, c.company || (c._intel && c._intel.company)); lookups++; }
        if (email) { c._foundEmail = email; picked.push(c); continue; }
        const dom = illustrativeDomain(c);
        if (dom) { c._illustrativeEmail = `${illustrativeLocal(c.name)}@${dom}`; picked.push(c); }
      }
      baseCache.set(sigKey, { cards: picked, exp: Date.now() + 60 * 60000 }); // refresh hourly
      return picked;
    } finally { basePromise.delete(sigKey); }
  })();
  basePromise.set(sigKey, pr);
  return pr;
}

// ── PER-PROSPECT: clone the shared base and write the 3 emails in their voice
// (one batched Haiku call). Cached per token so a second open is instant.
const cardsCache = new Map(); // token/key -> { cards, exp }
async function buildProspectCards(ctx) {
  const SIG = sigCfg(ctx.signal);
  const svc = resolveService(ctx.signal, ctx.service);
  const SVC = SIG.services[svc];
  const key = `${ctx.token || `${ctx.to}|${ctx.from}`}|${ctx.signal}|${svc}`;
  const hit = cardsCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.cards;
  const base = await getBaseCards(ctx.signal);
  const cards = base.map((c) => ({ ...c })); // clone so emails don't mutate shared base
  // One small Haiku call PER card, in parallel — lower wall-clock latency than a
  // single big batched call, so the cards fill in faster behind the loader.
  await Promise.all(cards.map(async (c) => {
    try {
      const company = (c._intel && c._intel.company) || c.name || 'the company';
      const prompt = `Write ONE short cold email FROM ${ctx.from ? ctx.from + ' at ' : ''}${ctx.to} (${SVC.senderDesc}) TO ${company}${SIG.emailAbout(c._intel)}.

POST: """${(c.post_text || '').slice(0, 400)}"""

Rules: start "Hi <recipient's first name, or 'there' if a company account>,"; 3 to 4 short sentences; max 70 words; ${SVC.emailRefAsk}; end on ONE soft question; British English; NO em or en dashes; no buzzwords; do NOT write a signature.

Return ONLY JSON: {"subject":<6 words max, personal>,"body":<email body with \\n line breaks>}`;
      const raw = await haiku(prompt, 320, MODEL);
      const e = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
      c._email = { subject: stripDashes(e.subject || ''), body: stripDashes(e.body || '') };
    } catch (e) { c._email = null; }
  }));
  cardsCache.set(key, { cards, exp: Date.now() + 30 * 60000 });
  return cards;
}

// The 3 cards + CTAs — the async fragment fetched into the loading shell.
function cardsFragment(cards, ctx) {
  const SIG = sigCfg(ctx.signal);
  const ctas = [
    `${ctx.firstName ? ctx.firstName + ', book' : 'Book'} your 15-minute call to get enquiries like these`, // 1: first name
    `Book a call to get ${ctx.to} enquiries like these every week`, // 2: company
    `Book my call for enquiries like these every week`, // 3: generic
  ];
  const ctaBtn = (i) => `<div class="cta"><a class="btn" href="#" onclick="sendBook();return false;">${esc(ctas[i % ctas.length])}</a></div>`;
  const cardHtml = cards.map((c, i) => `
    <article class="card">
      <div class="meta">
        ${c.image_url ? `<img class="avatar" src="${esc(c.image_url)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">` : ''}
        <span class="who">${esc(c.name || 'Anonymous')}</span>
        ${c.location ? `<span class="loc">· ${esc(c.location)}</span>` : ''}
        <span class="src">${ago(c.posted_at || c.created_at)}</span>
      </div>
      ${c.headline ? `<div class="headline">${esc(c.headline)}</div>` : ''}
      ${(() => {
        const i = c._intel || {};
        const domain = (c._foundEmail && c._foundEmail.split('@')[1]) || i.website || (c._illustrativeEmail && c._illustrativeEmail.split('@')[1]) || null;
        const sig = SIG.signalRow(i);
        const rows = [['Company', i.company], ...(sig ? [sig] : []), ['Location', i.location || c.location], ['Industry', i.industry], ['Company size', i.company_size]];
        let cells = rows.filter(([, v]) => v).map(([k, v]) => `<div class="ic"><span>${k}</span>${esc(String(v))}</div>`).join('');
        if (domain) cells += `<div class="ic"><span>Website</span><a href="https://${esc(domain.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(domain.replace(/^https?:\/\//, ''))}</a></div>`;
        if (c.linkedin_url) cells += `<div class="ic"><span>LinkedIn</span><a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">View profile</a></div>`;
        const realEmail = c._foundEmail || i.email;
        const anyEmail = realEmail || c._illustrativeEmail;
        const emailCell = anyEmail
          ? `<div class="ic email"><span>Email${realEmail ? ' · verified' : ''}</span>${esc(anyEmail)}</div>`
          : `<div class="ic email"><span>Email</span><em>${FINDYMAIL_KEY ? 'no match found' : 'connect enrichment to reveal'}</em></div>`;
        return `<div class="intel">${cells}${emailCell}</div>`;
      })()}
      <blockquote>“${esc((c.post_text || '').replace(/\s+/g, ' ').slice(0, 300))}”</blockquote>
      <a class="srclink" href="${esc(c.post_url || '#')}" target="_blank" rel="noopener">View the original post →</a>
      ${c._email ? `<div class="cmlabel">✉ Personalised email, ready to send</div>
      <div class="email">
        <div class="ehead"><span><b>From</b> ${esc(ctx.from ? ctx.from + ' · ' + ctx.to : ctx.to)}</span><span><b>To</b> ${esc((c._intel && c._intel.company) || c.name || '')}</span></div>
        <div class="esubj">${esc(c._email.subject)}</div>
        <div class="ebody">${esc(c._email.body).replace(/\n+/g, '<br><br>')}<br><br>${[ctx.from, ctx.to, ctx.site, ctx.email].filter(Boolean).map(esc).join('<br>')}</div>
      </div>` : ''}
    </article>
    ${ctaBtn(i)}`).join('');

  const shortfall = cards.length < 3
    ? `<div class="note">We're showing the ${cards.length === 1 ? 'one' : cards.length} strongest live signal${cards.length === 1 ? '' : 's'} from the last ${SIG.freshDays} days. We'd rather show fewer real ones than pad with weak matches, and more surface every week.</div>` : '';
  return shortfall + cardHtml;
}

// Instant shell with the branded "Sourcing…" loading screen. The 3 cards load
// asynchronously from /cards, so the page paints immediately.
function shellPage(ctx, cardCount) {
  const to = ctx.to;
  const SIG = sigCfg(ctx.signal);
  const SVC = SIG.services[resolveService(ctx.signal, ctx.service)];
  const subHeader = `Built to generate high-quality enquiries without paid ads or content. Designed specifically for ${SVC.audience}.`;
  const signalLine = `${SIG.needLead}${SVC.needTail ? ' ' + SVC.needTail : ''}`;
  const loaderMsgs = ['Sourcing your exact ideal clients…', `Scanning live ${SIG.loaderMoment}…`, 'Verifying their contact details…', 'Drafting your personalised emails…'];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signal Proof — ${esc(to)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  :root{--bg:#000;--panel:#0c0b09;--panel2:#121110;--line:rgba(201,168,76,.30);--gold:#c9a84c;--txt:#fff;--mut:#9b958a;--quote:#e9e4d8}
  [data-theme=light]{--bg:#f4f1ea;--panel:#fff;--panel2:#faf7f0;--line:rgba(160,125,30,.32);--gold:#9c7d1e;--txt:#1b1710;--mut:#6f695e;--quote:#2b2620}
  [data-theme=light] .brand{border-bottom-color:rgba(0,0,0,.12)}
  [data-theme=light] .who,[data-theme=light] .story .stat,[data-theme=light] .sub b,[data-theme=light] h1{color:#1b1710}
  [data-theme=light] .stories,[data-theme=light] .booking,[data-theme=light] .sitefooter{border-top-color:rgba(0,0,0,.12)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.55 Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .themebtn{position:fixed;top:14px;right:14px;z-index:20;width:38px;height:38px;border-radius:9px;background:var(--panel2);border:1px solid var(--line);color:var(--gold);font-size:16px;cursor:pointer;line-height:1}
  .wrap{width:80%;max-width:960px;margin:0 auto;padding:40px 20px 90px}
  @media(max-width:760px){.wrap{width:92%;padding:28px 16px 70px}}
  .brand{display:flex;align-items:center;gap:16px;font-size:13.5px;line-height:1.5;color:var(--mut);border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:16px;margin-bottom:28px}
  .brand b{color:var(--gold);font-weight:700}
  .logo{height:54px;width:auto;flex:0 0 auto}
  h1{font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-weight:700;font-size:clamp(34px,5.2vw,50px);line-height:1.18;margin:0 0 16px;text-transform:capitalize;text-align:center}
  h1 .hl{color:var(--gold)}
  .sub{color:var(--mut);font-size:16px;margin:0 auto 30px;max-width:680px;text-align:center}
  .sub b{color:#fff;font-weight:600}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:18px}
  .meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;margin-bottom:6px}
  .avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--line);flex:0 0 auto}
  .who{font-weight:700;font-size:15px;color:#fff}.loc{color:var(--mut)}
  .src{margin-left:auto;color:var(--gold);background:rgba(201,168,76,.08);border:1px solid var(--line);border-radius:20px;padding:2px 10px;font-size:12px}
  .headline{color:var(--mut);font-size:13px;margin-bottom:10px}
  .intel{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
  .ic{background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:6px 11px;font-size:13px;color:#efeadd}
  .ic span{display:block;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}
  .ic a{color:var(--gold);text-decoration:none}.ic a:hover{text-decoration:underline}
  .ic.email{background:#fbfaf7;color:#15140f;border:1px solid var(--gold)}
  .ic.email span{color:#a07d1e}.ic.email em{color:#8a8478;font-style:italic}
  blockquote{margin:8px 0 12px;padding:0;color:var(--quote);font-size:17px;line-height:1.5}
  .srclink{color:var(--gold);font-size:13px;text-decoration:none}.srclink:hover{text-decoration:underline}
  .opener{margin-top:14px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:8px;padding:12px 14px;font-size:15px;color:#f3efe6}
  .olabel{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:5px}
  .note{background:rgba(201,168,76,.06);border:1px solid var(--line);color:var(--gold);border-radius:10px;padding:12px 14px;font-size:13.5px;margin:6px 0 18px}
  .loadwrap{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:30px 10px}
  .spin{width:40px;height:40px;border-radius:50%;border:3px solid rgba(201,168,76,.22);border-top-color:var(--gold);animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .loadmsg{color:var(--gold);font-size:15.5px;letter-spacing:.01em;transition:opacity .2s}
  .cta{margin:42px 0 54px;text-align:center}
  .btn{display:inline-block;background:var(--gold);color:#000;font-weight:700;font-size:16px;text-decoration:none;padding:15px 32px;border-radius:8px}
  .btn:hover{background:#d8b85c}
  .stories{margin:44px 0 10px;padding-top:34px;border-top:1px solid rgba(255,255,255,.12)}
  .storieshead{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);text-align:center;margin-bottom:20px}
  .storygrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .story{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;display:flex;flex-direction:column;text-align:center}
  .story .stat{font-size:19px;line-height:1.28;font-weight:700;color:#fff;margin-bottom:10px}
  .story .storydesc{font-size:13px;color:var(--mut);margin-bottom:12px;flex:1}
  .story .storywho{display:flex;align-items:center;justify-content:center;gap:10px;font-size:12.5px;color:var(--gold);margin-top:auto}
  .storypic{width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--line);flex:0 0 auto}
  @media(max-width:640px){.storygrid{grid-template-columns:1fr}}
  .booking{margin-top:44px;padding-top:34px;border-top:1px solid rgba(255,255,255,.12);scroll-margin-top:20px}
  .bookhead{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:26px;margin:0 0 8px;color:var(--gold)}
  .booksub{color:var(--mut);font-size:16px;margin:0 0 22px;max-width:600px}
  .cal-embed{min-height:120px}
  .cal-embed .placeholder{background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:26px;text-align:center;color:var(--mut);font-size:14px}
  .sitefooter{margin-top:44px;padding-top:24px;border-top:1px solid rgba(255,255,255,.14);color:#6b665d;font-size:11.5px;line-height:1.6;text-align:center}
  .footlogo{height:46px;width:auto;display:block;margin:0 auto 18px}
  .footcontact{color:var(--mut);font-size:13px;margin-bottom:16px}
  .footcontact a{color:var(--gold);text-decoration:none}.footcontact a:hover{text-decoration:underline}
  .footdisc{margin:0 0 10px}.footdisc b{color:#8f897e}
  .emaillabel{margin:34px 0 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);text-align:center}
  .cmlabel{margin:16px 0 8px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
  .email .esubj,.email .ebody{font-size:14.5px}
  .email{background:#fbfaf7;color:#1a1a1a;border-radius:12px;border:1px solid var(--gold);overflow:hidden;font-size:15px;line-height:1.55}
  .email .ehead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#f0ede5;border-bottom:1px solid #e2ddd0;padding:10px 16px;font-size:12.5px;color:#5a554a}
  .email .ehead b{color:#1a1a1a;font-weight:600;margin-right:4px}
  .email .esubj{padding:14px 18px 4px;font-weight:700;font-size:16px;color:#111}
  .email .ebody{padding:4px 18px 18px;white-space:normal}
</style></head><body><button id="themebtn" class="themebtn" onclick="toggleTheme()" title="Light / dark">🌙</button><div class="wrap">
  <div class="brand"><img class="logo" src="/assets/ProspectMachine_Logo_Black.jpg" alt="Prospect Machine" onerror="this.style.display='none'"><span>${subHeader}</span></div>
  <h1>${ctx.firstName ? esc(ctx.firstName) + ', the ' : 'The '}<span class="hl">right clients</span> are already looking for you.</h1>
  <p class="sub">Here ${cardCount === 1 ? 'is' : 'are'} <b>${cardCount} UK ${cardCount === 1 ? 'business' : 'businesses'}</b> who signalled in the last ${SIG.freshDays} days that they need exactly what you do: ${signalLine}, right now.</p>
  <p class="sub">We'd take care of finding these people, writing and sending the emails, and following up, so enquiries of this quality land in your inbox every single week. You always have people ready to speak to you who need your services right now. No ads, no chasing.</p>
  <div id="cards"><div class="loadwrap"><div class="spin"></div><div class="loadmsg">Sourcing your exact ideal clients…</div></div></div>
  <div class="stories">
    <div class="storieshead">Real results for businesses like yours</div>
    <div class="storygrid">
      <div class="story">
        <div class="stat">“Speaking with the owner of a £15m company within 24 hours”</div>
        <div class="storydesc">First sales call landed within an hour of going live.</div>
        <div class="storywho"><img class="storypic" src="/assets/Alex.png" alt="" onerror="this.style.display='none'"><span>Alex Moon, marketing consultant</span></div>
      </div>
      <div class="story">
        <div class="stat">“127 highly-targeted calls booked in 34 days”</div>
        <div class="storydesc">A full calendar of the right conversations, fast.</div>
        <div class="storywho"><img class="storypic" src="/assets/Andy.png" alt="" onerror="this.style.display='none'"><span>Andy Harrington, leading UK business coach</span></div>
      </div>
      <div class="story">
        <div class="stat">“37 enquiries in the first 26 days”</div>
        <div class="storydesc">Consistent, qualified enquiries from day one.</div>
        <div class="storywho"><img class="storypic" src="/assets/Rob.png" alt="" onerror="this.style.display='none'"><span>Rob Barrett, UK property consultant</span></div>
      </div>
    </div>
  </div>
  <div id="booking" class="booking" style="display:none">
    <h2 class="bookhead">Great${ctx.firstName ? ', ' + esc(ctx.firstName) : ''}!</h2>
    <p class="booksub">To find out how this would apply specifically to your business, let's have a quick 15-minute chat. Grab a time with one of our team below. We look forward to speaking.</p>
    <div id="cal-embed" class="cal-embed">
      <iframe src="https://link.prospectconnect.io/widget/booking/ruVhcht8ikeLm4EHanpd?full_name=${encodeURIComponent(`${ctx.firstName || ''} ${ctx.lastName || ''}`.trim())}&first_name=${encodeURIComponent(ctx.firstName || '')}&last_name=${encodeURIComponent(ctx.lastName || '')}&email=${encodeURIComponent(ctx.email || '')}&company=${encodeURIComponent(ctx.to || '')}&company_name=${encodeURIComponent(ctx.to || '')}" style="width:100%;border:none;overflow:hidden;min-height:720px" scrolling="no" id="ruVhcht8ikeLm4EHanpd_pm"></iframe>
    </div>
  </div>
  <div class="sitefooter">
    <img class="footlogo" src="/assets/ProspectMachine_Logo_Black.jpg" alt="Prospect Machine" onerror="this.style.display='none'">
    <div class="footcontact">📍 45 Fitzroy St, Fitzrovia, London, W1T 6EB&nbsp;&nbsp;·&nbsp;&nbsp;📞 +44 203 026 4653&nbsp;&nbsp;·&nbsp;&nbsp;✉️ <a href="mailto:Info@ProspectMachine.co">Info@ProspectMachine.co</a></div>
    <p class="footdisc"><b>Disclaimer:</b> Prospect Machine™ is a trading name of Charwood Marketing Services Ltd. Address: 45 Fitzroy St, Fitzrovia, London, W1T 6EB.</p>
    <p class="footdisc">This website and the results mentioned on this page are not endorsed by, affiliated with, associated with, or in any way officially connected to Meta Platforms Inc., Facebook, Instagram, or any of their subsidiaries or affiliates. The Facebook and Instagram names, logos and trademarks are the property of Meta Platforms Inc.</p>
    <p class="footdisc">Results shown on this page, including but not limited to appointments booked, prospects generated and replies received, are real results achieved by real clients. However, results are not guaranteed and will vary from person to person depending on your offer, your market, your experience and a number of other individual factors. Nothing on this page constitutes a guarantee of income, results or specific outcomes.</p>
    <p class="footdisc">By booking a consultation via this page you agree to be contacted by a member of our team. We will never share or sell your data to third parties.</p>
  </div>
</div>
<script>
  window.__prospect = { firstName: ${JSON.stringify(ctx.firstName || '')}, lastName: ${JSON.stringify(ctx.lastName || '')}, email: ${JSON.stringify(ctx.email || '')} };
  function sendBook(){ var b=document.getElementById('booking'); b.style.display='block'; b.scrollIntoView({behavior:'smooth',block:'start'}); }
  function toggleTheme(){ setTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light'); }
  function setTheme(t){ document.documentElement.setAttribute('data-theme',t); try{localStorage.setItem('sp-theme',t);}catch(e){} var b=document.getElementById('themebtn'); if(b) b.textContent = t==='light'?'☀️':'🌙'; }
  (function(){ var t='dark'; try{ t=localStorage.getItem('sp-theme')||'dark'; }catch(e){} setTheme(t); })();
  (function(){
    var msgs=${JSON.stringify(loaderMsgs)};
    var el=document.querySelector('.loadmsg'), i=0;
    var t=setInterval(function(){ i=(i+1)%msgs.length; if(el){ el.style.opacity=0; setTimeout(function(){ el.textContent=msgs[i]; el.style.opacity=1; },180); } },1600);
    var TOKEN=${JSON.stringify(ctx.token || '')};
    var url=TOKEN ? '/cards/'+encodeURIComponent(TOKEN)+location.search : '/cards'+location.search;
    fetch(url).then(function(r){ if(!r.ok) throw new Error('load'); return r.text(); })
      .then(function(html){ clearInterval(t); var box=document.getElementById('cards'); if(box) box.innerHTML=html; })
      .catch(function(){ clearInterval(t); if(el){ el.textContent='Could not load right now — please refresh the page.'; } });
  })();
</script>
<script src="https://link.prospectconnect.io/js/form_embed.js" type="text/javascript"></script>
</body></html>`;
}

// Neutral holding page for the public root / bad tokens (no API calls, no cost).
function landing(title, sub) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prospect Machine</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
body{margin:0;background:#000;color:#fff;font:16px/1.6 Inter,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
.box{max-width:520px}img{height:56px;margin-bottom:24px}h1{font-size:26px;margin:0 0 12px}p{color:#9b958a;margin:0 0 22px}a{display:inline-block;background:#c9a84c;color:#000;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px}</style></head>
<body><div class="box"><img src="/assets/ProspectMachine_Logo_Black.jpg" alt="Prospect Machine" onerror="this.style.display='none'"><h1>${esc(title)}</h1><p>${esc(sub)}</p><a href="https://prospectmachine.co">Visit prospectmachine.co</a></div></body></html>`;
}

// ── gated admin console: your markets & services + CSV link-minting ──
async function enquiryCounts() {
  const out = {};
  await Promise.all(Object.keys(SIGNALS).map(async (k) => {
    let pool = null, shown = null;
    try { pool = (await supabaseSignals(SIGNALS[k].clientId)).length; } catch {}
    try { shown = (await getBaseCards(k)).length; } catch {} // actually rendered = has a findable email
    out[k] = { pool, shown };
  }));
  return out;
}
function consolePage(counts) {
  const K = encodeURIComponent(CONSOLE_KEY);
  const sigMap = Object.fromEntries(Object.entries(SIGNALS).map(([sk, s]) => [sk, {
    label: s.label || sk, defaultService: s.defaultService,
    services: Object.entries(s.services).map(([k, v]) => ({ key: k, label: v.label || k })),
  }]));
  const sections = Object.entries(SIGNALS).map(([sk, s]) => {
    const svc = Object.entries(s.services).map(([k, v]) =>
      `<div class="svc">
        <div class="svcname">${esc(v.label || k)}</div><div class="svcaud">${esc(v.audience)}</div>
        <div class="svcneed">"…and need ${esc(v.needTail || 'exactly what you do')}"</div>
        <div class="svcacts"><a href="/?signal=${sk}&service=${k}&to=Demo%20Business&from=Sam&key=${K}" target="_blank" rel="noopener">Preview page</a> · <a href="#mint" onclick="pickMint('${sk}','${k}');return false;">＋ Upload ${esc(v.label || k)} list</a></div>
      </div>`).join('');
    const c = counts[sk] || {};
    return `<section class="sig"><div class="sighead">
      <div><div class="signame">${esc(s.label || sk)}</div><div class="sigsub">signal · <code>${sk}</code> · window ${s.freshDays}d</div></div>
      <div class="pool"><b>${c.shown == null ? '—' : c.shown}</b> showing now<div class="poolsub">of ${c.pool == null ? '—' : c.pool} in the pool</div></div></div>
      <div class="svcgrid">${svc}</div></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signal Proof — Console</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
:root{--gold:#c9a84c;--panel:#121110;--line:rgba(201,168,76,.28);--mut:#9b958a}*{box-sizing:border-box}
body{margin:0;background:#0b0a09;color:#eee;font:15px/1.5 Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding:32px 20px 70px}
.wrap{max-width:1000px;margin:0 auto}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;color:var(--gold);margin:34px 0 14px;letter-spacing:.02em}
.lede{color:var(--mut);margin:0 0 8px;font-size:14px}
.sig{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px}
.sighead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px;flex-wrap:wrap}
.signame{font-size:18px;font-weight:700;color:#fff}.sigsub{color:var(--mut);font-size:12px;margin-top:2px}.sigsub code{color:#d8c98f}
.pool{color:var(--gold);font-size:13px;text-align:right}.pool b{font-size:24px;margin-right:5px}.poolsub{color:var(--mut);font-size:11px;margin-top:1px}
.svcgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:11px}
.svc{display:block;text-decoration:none;background:#0e0d0c;border:1px solid var(--line);border-radius:10px;padding:13px;transition:.15s}
.svc:hover{border-color:var(--gold);background:rgba(201,168,76,.06)}
.svcname{color:var(--gold);font-weight:700;font-size:14px;margin-bottom:3px}.svcaud{color:#efeadd;font-size:12px;margin-bottom:7px}.svcneed{color:var(--mut);font-size:11.5px;font-style:italic}
.svcacts{margin-top:9px;font-size:11.5px}.svcacts a{color:var(--gold);text-decoration:none}.svcacts a:hover{text-decoration:underline}
.mint.flash{border-color:var(--gold);box-shadow:0 0 0 2px rgba(201,168,76,.25)}
.mint{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
.row{display:flex;gap:12px;margin-bottom:14px}.row label{flex:1;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--gold)}
select{width:100%;margin-top:6px;padding:11px;background:#0e0d0c;color:#efeadd;border:1px solid var(--line);border-radius:9px;font-size:14px}
.drop{display:block;border:2px dashed rgba(201,168,76,.4);border-radius:12px;padding:28px 20px;text-align:center;cursor:pointer;background:#0e0d0c}.drop.over{border-color:var(--gold)}.drop b{color:var(--gold)}#file{display:none}
.nm{margin-top:12px;font-size:13px;color:#efeadd}
button{margin-top:16px;width:100%;padding:13px;font-size:15px;font-weight:700;background:var(--gold);color:#000;border:0;border-radius:9px;cursor:pointer}button:disabled{opacity:.45}
.out{margin-top:18px;padding:15px;border-radius:10px;background:#0e0d0c;border:1px solid var(--line);display:none}.out.show{display:block}.out b{color:var(--gold)}.dl{display:inline-block;margin-top:10px;background:var(--gold);color:#000;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px}.err{color:#ef8a8a}
code{background:#1a1917;padding:2px 6px;border-radius:5px;color:#d8c98f;font-size:12.5px}.hint{margin-top:14px;font-size:12px;color:#6b665d}</style></head>
<body><div class="wrap">
<h1>Signal Proof — Console</h1>
<p class="lede">Your live markets (signals) and the services running off each. Click any service to preview its page.</p>
${sections}
<h2>Mint campaign links</h2>
<div class="mint" id="mint">
  <p class="lede">Pick the market + service this campaign targets, drop your lead CSV, get a CSV back with a <code>signal_link</code> per lead for PlusVibe.</p>
  <div class="row"><label>Market (signal)<select id="signal"></select></label><label>Service (who you email)<select id="service"></select></label></div>
  <label class="drop" id="drop"><div>Drag your CSV here or <b>click to choose</b></div><input id="file" type="file" accept=".csv,text/csv"><div class="nm" id="nm"></div></label>
  <button id="go" disabled>Build links</button>
  <div class="out" id="out"></div>
  <div class="hint">A <code>service</code> column in your CSV overrides the dropdown per row. Minting is free — a lead only costs anything when they open their link.</div>
</div></div>
<script>
const SIG=${JSON.stringify(sigMap)}, KEY=${JSON.stringify(CONSOLE_KEY)};
const sSel=document.getElementById('signal'),vSel=document.getElementById('service'),file=document.getElementById('file'),drop=document.getElementById('drop'),nm=document.getElementById('nm'),go=document.getElementById('go'),out=document.getElementById('out');
for(const k in SIG){const o=document.createElement('option');o.value=k;o.textContent=SIG[k].label;sSel.appendChild(o);}
function fill(){vSel.innerHTML='';const s=SIG[sSel.value];for(const x of s.services){const o=document.createElement('option');o.value=x.key;o.textContent=x.label;vSel.appendChild(o);}vSel.value=s.defaultService;}
sSel.onchange=fill;if(SIG['office-moved'])sSel.value='office-moved';fill();
window.pickMint=function(sig,svc){sSel.value=sig;fill();vSel.value=svc;const m=document.getElementById('mint');m.scrollIntoView({behavior:'smooth',block:'center'});m.classList.add('flash');setTimeout(function(){m.classList.remove('flash');},1500);};
let picked=null;
function set(f){if(!f)return;picked=f;nm.textContent='📄 '+f.name;go.disabled=false;out.className='out';}
file.onchange=e=>set(e.target.files[0]);drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};drop.ondragleave=()=>drop.classList.remove('over');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');set(e.dataTransfer.files[0]);};
go.onclick=async()=>{if(!picked)return;go.disabled=true;go.textContent='Building…';const text=await picked.text();
 try{const r=await fetch('/console/mint?key='+encodeURIComponent(KEY),{method:'POST',headers:{'content-type':'text/csv','x-signal':sSel.value,'x-service':vSel.value},body:text});const j=await r.json();if(!j.ok)throw new Error(j.error||'failed');
  const url=URL.createObjectURL(new Blob([j.csv],{type:'text/csv'}));out.className='out show';
  out.innerHTML='<div><b>'+j.minted+'</b> links minted for <b>'+sSel.value+' · '+j.service+'</b>'+(j.skipped?' · <b>'+j.skipped+'</b> skipped (no email)':'')+'</div><a class="dl" href="'+url+'" download="'+j.outName+'">Download '+j.outName+'</a><div class="hint" style="margin-top:10px">Upload to PlusVibe, use <code>{{signal_link}}</code> in your reply.</div>';
 }catch(e){out.className='out show';out.innerHTML='<div class="err">Error: '+e.message+'</div>';}
 go.disabled=false;go.textContent='Build links';};
</script></body></html>`;
}

const pageCache = new Map(); // req.url -> { html, exp } — shells + card fragments

// Resolve the prospect + render context from a /s/<token> or /cards/<token> path
// (or ?query for local dev). Returns { ctx } or { blocked:'gone'|'guard' }.
async function resolveCtx(u, host, authed) {
  const tokenMatch = u.pathname.match(/^\/(?:s|cards)\/([A-Za-z0-9_-]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;
  const p = await getProspect(token);
  if (token && !p) return { blocked: 'gone' };
  if (TOKEN_ONLY && !p && !authed) return { blocked: 'guard' }; // public cost guard (console key previews bypass)
  const to = p ? p.company : (u.searchParams.get('to') || 'Your Business');
  const from = p ? (p.sender_name || p.first_name) : (u.searchParams.get('from') || '');
  const firstName = p ? p.first_name : (from ? from.split(' ')[0] : (u.searchParams.get('name') || ''));
  const lastName = (p ? (p.sender_name || '') : (u.searchParams.get('lastname') || from)).split(/\s+/).slice(1).join(' ');
  const slug = to.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const site = p ? p.website : (u.searchParams.get('site') || (slug ? slug + '.co.uk' : ''));
  const cEmail = p ? p.email : (u.searchParams.get('email') || (site ? (from ? from.split(' ')[0].toLowerCase() + '@' + site : 'hello@' + site) : ''));
  const rawVariant = p && (p.service || p.variant); // "office-moved:it" or just "it"
  // Signal per request: ?signal= > prospect's stored signal/variant > Host subdomain > default
  const subdomain = (host || '').split(':')[0].split('.')[0];
  const sigKey = resolveSignal(u.searchParams.get('signal') || (p && p.signal) || (rawVariant && rawVariant.includes(':') ? rawVariant.split(':')[0] : null) || SUBDOMAIN_SIGNAL[subdomain]);
  const rawSvc = u.searchParams.get('service') || (rawVariant && rawVariant.includes(':') ? rawVariant.split(':')[1] : rawVariant) || '';
  return { ctx: { to, from, firstName, lastName, site, email: cEmail, token, signal: sigKey, service: resolveService(sigKey, rawSvc) } };
}

const server = http.createServer(async (req_, res) => {
  try {
    if (req_.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req_.url.startsWith('/assets/')) { // static images (logo, headshots)
      try {
        const f = path.join(__dirname, 'assets', path.basename(req_.url.split('?')[0]));
        const buf = fs.readFileSync(f);
        const ext = path.extname(f).slice(1).toLowerCase();
        const ct = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'content-type': ct, 'cache-control': 'public,max-age=86400' });
        return res.end(buf);
      } catch (e) { res.writeHead(404); return res.end('not found'); }
    }

    const u = new URL(req_.url, `http://localhost:${PORT}`);
    const authed = u.searchParams.get('key') === CONSOLE_KEY; // admin console / preview

    // ── /console (gated: markets & services overview + CSV link-minting) ──
    if (u.pathname === '/console' || u.pathname === '/console/mint') {
      if (!authed) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      if (u.pathname === '/console/mint' && req_.method === 'POST') {
        let body = '';
        req_.on('data', (c) => (body += c));
        req_.on('end', async () => {
          try {
            const { csv, minted, skipped, service } = await buildLinks(body, { signal: req_.headers['x-signal'], service: req_.headers['x-service'] });
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, minted, skipped, csv, service, outName: `campaign-${req_.headers['x-signal'] || 'links'}-${service || ''}.csv` }));
          } catch (e) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e.message })); }
        });
        return;
      }
      const counts = await enquiryCounts();
      res.writeHead(200, { 'content-type': 'text/html' }); return res.end(consolePage(counts));
    }

    // ── /cards — the heavy Findymail + AI build, fetched async by the shell ──
    if (u.pathname.startsWith('/cards')) {
      const cachedF = pageCache.get(req_.url);
      if (cachedF && cachedF.exp > Date.now()) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(cachedF.html); }
      const { ctx, blocked } = await resolveCtx(u, req_.headers.host, authed);
      if (blocked) { res.writeHead(blocked === 'gone' ? 404 : 403); return res.end(''); }
      const cards = await buildProspectCards(ctx);
      const html = cardsFragment(cards, ctx);
      pageCache.set(req_.url, { html, exp: Date.now() + 30 * 60000 });
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(html);
    }

    // ── /s/<token> (or root/query) — instant shell, cards load after ──
    const cachedShell = pageCache.get(req_.url);
    if (cachedShell && cachedShell.exp > Date.now()) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(cachedShell.html); }
    const { ctx, blocked } = await resolveCtx(u, req_.headers.host, authed);
    if (blocked === 'gone') { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(landing('This link is no longer valid.', 'Ask your Prospect Machine contact for an up to date link.')); }
    if (blocked === 'guard') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(landing('This is a personalised page.', 'Your unique link was included in the email we sent you. Open it there to see the businesses signalling for you right now.')); }
    const bc = baseCache.get(ctx.signal);
    const cardCount = bc && bc.cards ? bc.cards.length : 3;
    const html = shellPage(ctx, cardCount);
    pageCache.set(req_.url, { html, exp: Date.now() + 30 * 60000 });
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/html' });
    res.end(`<pre style="color:#b00;font:14px monospace;padding:20px">Magnet error: ${esc(e.message)}\n\nCheck twin .env has SUPABASE_URL / SUPABASE_SERVICE_KEY / ANTHROPIC_API_KEY.</pre>`);
  }
});
server.listen(PORT, () => {
  console.log(`\n  Signal Proof — Magnet`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  twin DB: ${SUPABASE_URL ? 'loaded ✓' : 'MISSING ✗'}  ·  Anthropic: ${ANTHROPIC_KEY ? 'loaded ✓' : 'MISSING ✗'}`);
  // Prewarm each shelf's base cards so the first prospect open is instant.
  Object.keys(SIGNALS).forEach((k) => getBaseCards(k)
    .then((c) => console.log(`  prewarmed ${k}: ${c.length} enquiries ✓`))
    .catch((e) => console.log(`  ${k} prewarm deferred (${e.message})`)));
});
