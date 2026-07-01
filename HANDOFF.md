# Signal Proof — Handoff

A personalised **reverse lead-magnet landing page** for Prospect Machine (PM) cold
outbound. You cold-email a prospect; when they reply "yes", you send them their
own link. The page shows them **3 real UK businesses signalling a need right now**,
example cold emails written **in their voice** to those businesses, PM success
stories, and a booking widget — all personalised with their name/company.

**Market #1 (built & LIVE):** targets **sales coaches / trainers / consultants**.
The 3 businesses shown are **UK companies hiring & scaling sales teams** (i.e. warm
buyers of sales training). This doc is the map for cloning it into a **new market**.

---

## Live state (Market #1)
- **Custom domain:** https://signals.prospectmachine.co  (TLS live)
- **Railway URL:** https://signal-proof-magnet-production.up.railway.app
- **Railway project/service:** `robust-enjoyment` / `signal-proof-magnet` (auto-deploys from GitHub `main`)
- **GitHub:** `github.com/markvurnum/signal-proof-magnet` (private). Push via deploy key `~/.ssh/signal_proof_deploy`:
  `GIT_SSH_COMMAND="ssh -i ~/.ssh/signal_proof_deploy -o IdentitiesOnly=yes" git push origin main`
- **Twin Supabase:** project `anzlbkbhkgamfhthfcxr` (the `mark@prospectmachine.co` account, project `signal-proof-twin`). This is the MARKETING twin — NOT the live engine DB.

## Infra / creds
- Local creds live in `intent-engine-marketing/.env` (twin). Collect/rotate keys via the
  secure form: `KEY_NAME=ANTHROPIC_API_KEY node intent-engine-marketing/server/src/scripts/key-form.js` (localhost:4710). Never paste keys in chat.
- **Railway env vars** (Settings → Variables, Raw Editor):
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `FINDYMAIL_API_KEY`,
  `TOKEN_ONLY=true`, `MAGNET_BASE_URL=https://signals.prospectmachine.co`,
  `NICHE_CLIENT_ID=224bef46-a50f-43fd-b389-f7bb25e1eb7b`.
- `TOKEN_ONLY=true` is the **cost guard**: only a real prospect token runs the paid
  Findymail/AI build; root and unknown links get a static landing (no cost).

## Files (`signal-proof/magnet/`)
- `server.js` — the page. Pure Node, no deps. Instant shell + async `/cards` fragment.
- `build-links.js` — CSV → mints a token per lead → adds `signal_link` column. Exports `buildLinks()`.
- `link-uploader.js` — web upload page (localhost:4060) wrapping build-links (no CLI needed).
- `add-prospect.js` — mint a single link on the command line.
- `sql/magnet_prospects.sql` — the prospect token table (run once per Supabase project).
- `assets/` — logo + success-story headshots (Alex/Andy/Rob).
- `DEPLOY.md` — deploy runbook.

## Data model
- **`magnet_prospects`** table (twin Supabase): `token` (PK), `first_name`, `sender_name`,
  `company`, `website`, `email`, `niche_client_id` (optional, for per-prospect niche = v2), `created_at`.
- **`signals`** table (twin Supabase): the leads/cards, populated by the
  `intent-engine-marketing` pre-flight scraper. Filtered by `client_id = NICHE_CLIENT_ID`
  and `score >= 70`. Each row: name, headline, company, location, post_text, post_url,
  source, linkedin_url, score, image_url, posted_at.

## Architecture (why it's fast)
- `/s/<token>` → **instant shell** (~0.2s): headline + intro + branded loader
  ("Sourcing your exact ideal clients…") + stories + footer.
- Shell JS fetches `/cards/<token>` → the heavy build → injects the 3 cards.
- `getBaseCards()` — SHARED across all prospects (same 3 companies): lead selection +
  Findymail verified email + company intel. **Cached globally (hourly), prewarmed at startup.**
- `buildProspectCards(ctx)` — PER prospect: clones base + writes the 3 emails in their
  voice (parallel Haiku calls). Cached per token 30 min.
- Model: `claude-haiku-4-5` for both intel + emails (speed/cost).

## The PlusVibe workflow (how links get sent)
1. Before a campaign, run each lead CSV through **`link-uploader.js`** (localhost:4060) or
   `build-links.js` → get the CSV back with a `signal_link` column.
2. Upload to PlusVibe → `signal_link` becomes a merge tag.
3. In the reply template use `{{signal_link}}`. Prospect says yes → hit Reply → their link is there.
   Minting is free; a lead only costs anything when they open their link.
- Minimum data per lead: **email + first name + company** (website/last name auto-derived).
- Tokens are deterministic from the email (re-running a list = same links, no dupes).

---

## To build ANOTHER MARKET (the actual task)
Pick the new market = **who you cold-email (the prospect)** + **what businesses/signals to show them**.
Example: target *recruitment agencies* and show them *companies posting lots of open roles*; or
target *fractional CFOs* and show them *companies announcing funding/scaling finance*.

What has to change:
1. **Signals for the new niche.** Create a niche config + run the pre-flight scraper in
   `intent-engine-marketing` (see its `server/src/scripts/run-preflight.js` and `niches/`),
   which scrapes → scores → writes gate-passing rows into the `signals` table under a NEW
   `client_id`. That new client_id becomes the market's `NICHE_CLIENT_ID`.
2. **Page copy in `server.js`** — these strings are hardwired to Market #1 and must be
   parameterised per market (search for them):
   - Sub-headline: *"they're hiring and scaling their sales team…"*
   - The email prompt's sender identity: *"a sales coaching and training business that helps
     companies ramp and train new sales hires…"* (in `buildProspectCards`)
   - The intel prompt framing: *"public hiring post"* (in `getBaseCards`)
   - Success stories (Alex/Andy/Rob) + headshots — swap if the new market wants different proof.
3. **Deploy target** — decide one:
   - **New subdomain + new Railway service** (cleanest separation): new repo or same repo with a
     `NICHE_CLIENT_ID` env override + own domain (e.g. `signals-recruit.prospectmachine.co`).
   - **Same instance, per-prospect niche**: honour `magnet_prospects.niche_client_id` in
     `getBaseCards`/`supabaseSignals` so one deploy serves multiple markets by token. (This is
     the v2 the current code is scaffolded for but doesn't yet wire up — the column exists.)
4. **Booking widget** — the GHL iframe in `server.js` points at PM's calendar
   (`ruVhcht8ikeLm4EHanpd`). Reuse or swap per market. Note: the GHL form still needs a
   **Company field** added for company prefill (outstanding TODO).

### Recommended clone path for a new market
Cleanest: copy `signal-proof/magnet` → new folder, set a new `NICHE_CLIENT_ID`, update the ~4
copy strings above, run the scraper to fill `signals` for that client_id, then deploy as a new
Railway service on a new subdomain. Reuse the SAME twin Supabase (add the market's signals under
its own client_id; `magnet_prospects` can be shared or per-market).

## Known TODOs / gotchas
- **GHL Company field** not yet added → company doesn't prefill in the booking widget (name+email do).
- **LinkedIn avatar URLs** on cards can expire (they're scraped); may 404 over time.
- First prospect right after a deploy waits ~10-15s while base cards prewarm; fine after.
- Do NOT touch the LIVE intent-engine / prod DB — everything here is the marketing twin.
