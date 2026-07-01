#!/usr/bin/env node
/* Way 1 — pre-mint a Signal Proof link for every lead in a campaign CSV.
 *
 * Reads your PlusVibe lead CSV, mints a token per lead (writes to the Supabase
 * magnet_prospects store), and writes a NEW CSV with a `signal_link` column you
 * upload to PlusVibe. Use {{signal_link}} in your reply template and "hit reply"
 * just works.
 *
 * Minting is free: the paid Findymail/Sonnet build only runs when a prospect
 * actually opens their link.
 *
 * CLI:
 *   node build-links.js leads.csv                 -> writes leads-with-links.csv
 *   node build-links.js leads.csv out.csv         -> custom output name
 * Or use the upload page:  node link-uploader.js  (http://localhost:4060)
 *
 * - Column names are matched flexibly (First Name / firstname / fname all work).
 * - Tokens are DETERMINISTIC from the email, so re-running the same list reuses
 *   the same token/link (no duplicates, links stay stable).
 * - Rows with no email are passed through with an empty signal_link (skipped).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// ── load twin .env (same creds the server uses) ──
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
const DEFAULT_BASE = (process.env.MAGNET_BASE_URL || 'https://signals.prospectmachine.co').replace(/\/+$/, '');

// ── minimal CSV parse/stringify (handles quoted fields, commas, CRLF) ──
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0] === ''));
}
const csvCell = (v = '') => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// ── flexible column matching ──
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function makePicker(header) {
  const map = {}; header.forEach((h, i) => (map[norm(h)] = i));
  return (row, aliases) => { for (const a of aliases) if (map[a] !== undefined && row[map[a]]) return row[map[a]].trim(); return ''; };
}
const titleize = (s) => s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// ── transform a CSV string -> { csv, records, minted, skipped } (no network) ──
function transform(csvText, baseUrl = DEFAULT_BASE) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('CSV has no data rows.');
  const header = rows[0];
  const pick = makePicker(header);
  const records = [];
  const outRows = [header.concat(['signal_link'])];
  let minted = 0, skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const email = pick(row, ['email', 'emailaddress', 'email1', 'workemail', 'emailaddress1']).toLowerCase();
    if (!email) { outRows.push(row.concat([''])); skipped++; continue; }

    const first = pick(row, ['firstname', 'first', 'fname']) || pick(row, ['name', 'fullname']).split(/\s+/)[0] || '';
    const last = pick(row, ['lastname', 'last', 'lname', 'surname']);
    const domain = (pick(row, ['website', 'domain', 'companydomain', 'url', 'site']) || email.split('@')[1] || '')
      .replace(/^https?:\/\//, '').replace(/\/+$/, '');
    let company = pick(row, ['company', 'companyname', 'organization', 'organisation', 'business', 'account']);
    if (!company && domain) company = titleize(domain.split('.')[0]);

    const hash = crypto.createHash('sha1').update(email).digest('hex').slice(0, 5);
    const slugBase = (company ? company : domain.split('.')[0] || 'lead').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const token = `${slugBase}-${hash}`;

    records.push({ token, first_name: first, sender_name: [first, last].filter(Boolean).join(' ') || first, company, website: domain, email });
    outRows.push(row.concat([`${baseUrl}/s/${token}`]));
    minted++;
  }
  return { csv: outRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n', records, minted, skipped };
}

// ── upsert records to Supabase in chunks (idempotent on token PK) ──
function upsertChunk(chunk) {
  return new Promise((resolve, reject) => {
    const u = new URL(SUPABASE_URL);
    const body = JSON.stringify(chunk);
    const req = https.request({
      host: u.host, path: '/rest/v1/magnet_prospects', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'resolution=merge-duplicates,return=minimal' },
    }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => (res.statusCode >= 300 ? reject(new Error(`HTTP ${res.statusCode}: ${b.slice(0, 200)}`)) : resolve())); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ── full pipeline: transform + write tokens to Supabase ──
async function buildLinks(csvText, baseUrl = DEFAULT_BASE) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase creds in the twin .env.');
  const out = transform(csvText, baseUrl);
  for (let i = 0; i < out.records.length; i += 500) await upsertChunk(out.records.slice(i, i + 500));
  return out;
}

module.exports = { buildLinks, transform, DEFAULT_BASE };

// ── CLI ──
if (require.main === module) {
  const inFile = process.argv[2];
  if (!inFile) { console.error('\n  Usage: node build-links.js <leads.csv> [out.csv]   (or: node link-uploader.js for the upload page)\n'); process.exit(1); }
  const outFile = process.argv[3] || inFile.replace(/\.csv$/i, '') + '-with-links.csv';
  buildLinks(fs.readFileSync(inFile, 'utf8')).then(({ csv, minted, skipped }) => {
    fs.writeFileSync(outFile, csv);
    console.log(`\n  ✓ ${minted} links minted${skipped ? ` (${skipped} rows skipped — no email)` : ''}`);
    console.log(`  ✓ wrote ${outFile}`);
    console.log(`\n  Upload that file to PlusVibe, then use {{signal_link}} in your reply template.\n`);
  }).catch((e) => {
    console.error('\n  Failed:', e.message);
    if (/magnet_prospects.* does not exist/i.test(e.message)) console.error('  → run sql/magnet_prospects.sql first.');
    process.exit(1);
  });
}
