#!/usr/bin/env node
/* Mint a personalised Signal Proof link for a prospect who replied.
 *
 * Usage:
 *   node add-prospect.js --first "John" --sender "John Smith" \
 *        --company "Acme Sales Coaching" --site "acmecoaching.co.uk" \
 *        --email "john@acmecoaching.co.uk" [--token acme]
 *
 * Writes to the Supabase magnet_prospects table (so the LIVE site sees the link
 * instantly, from wherever you run this). Add --local to write prospects.json
 * instead (offline / dev). Prints the link to send.
 *
 * Base URL for the printed link:
 *   export MAGNET_BASE_URL=https://signals.prospectmachine.co
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
const BASE_URL = (process.env.MAGNET_BASE_URL || 'http://localhost:4050').replace(/\/+$/, '');
const FILE = path.join(__dirname, 'prospects.json');

// parse --flag value pairs
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}

const first = args.first || '';
if (!first || !args.company) {
  console.error('\n  Missing required fields. At minimum: --first and --company\n');
  console.error('  node add-prospect.js --first "John" --sender "John Smith" --company "Acme Sales Coaching" --site "acmecoaching.co.uk" --email "john@acmecoaching.co.uk"\n');
  process.exit(1);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const token = (typeof args.token === 'string' && args.token) || `${slug(args.company)}-${crypto.randomBytes(2).toString('hex')}`;
const site = String(args.site || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const row = {
  token,
  first_name: first,
  sender_name: args.sender || first,
  company: args.company,
  website: site,
  email: args.email || (site ? `${first.toLowerCase()}@${site}` : ''),
};

function done() {
  const link = `${BASE_URL}/s/${token}`;
  console.log(`\n  ✓ Prospect saved (token: ${token})`);
  console.log(`  ${JSON.stringify(row)}`);
  console.log(`\n  Send them this link:\n  ${link}\n`);
}

function saveLocal() {
  const store = (() => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return {}; } })();
  if (store[token]) { console.error(`\n  Token "${token}" already exists locally. Pass a different --token.\n`); process.exit(1); }
  const { token: _t, created_at: _c, ...rest } = row;
  store[token] = rest;
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2) + '\n');
  done();
}

function saveSupabase() {
  const u = new URL(SUPABASE_URL);
  const body = JSON.stringify(row);
  const r = https.request({
    host: u.host, path: '/rest/v1/magnet_prospects', method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
  }, (res) => {
    let buf = ''; res.on('data', (c) => (buf += c));
    res.on('end', () => {
      if (res.statusCode >= 300) {
        console.error(`\n  Supabase insert failed (HTTP ${res.statusCode}): ${buf.slice(0, 200)}`);
        if (/relation .*magnet_prospects.* does not exist/i.test(buf)) console.error('  → Run sql/magnet_prospects.sql in the twin project first.');
        if (res.statusCode === 409) console.error('  → That token already exists. Pass a different --token.');
        process.exit(1);
      }
      done();
    });
  });
  r.on('error', (e) => { console.error('\n  Supabase request error:', e.message); process.exit(1); });
  r.write(body); r.end();
}

if (args.local || !SUPABASE_URL || !SUPABASE_KEY) {
  if (!args.local) console.log('  (Supabase creds not found — writing to local prospects.json)');
  saveLocal();
} else {
  saveSupabase();
}
