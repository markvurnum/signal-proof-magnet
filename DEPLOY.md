# Signal Proof — Deploy (Railway + GitHub)

Personalised reverse lead-magnet page. Pure Node, no build step.

## 1. One-time: create the prospect table (twin Supabase)
Run `sql/magnet_prospects.sql` in the **twin** project's SQL editor
(project `anzlbkbhkgamfhthfcxr`, the marketing twin — NOT the live engine).

## 2. Push to GitHub
Repo is already `git init`-ed and committed locally. Create an empty **private**
repo on GitHub, then:
```
git remote add origin git@github.com:<you>/signal-proof-magnet.git
git push -u origin main
```

## 3. Railway
- New project → Deploy from the GitHub repo.
- Start command is `npm start` (from package.json). Node ≥22.
- **Variables** (Settings → Variables):
  ```
  SUPABASE_URL=https://anzlbkbhkgamfhthfcxr.supabase.co
  SUPABASE_SERVICE_KEY=<twin service_role key>
  ANTHROPIC_API_KEY=<key>
  FINDYMAIL_API_KEY=<key>
  TOKEN_ONLY=true
  MAGNET_BASE_URL=https://signals.prospectmachine.co
  NICHE_CLIENT_ID=224bef46-a50f-43fd-b389-f7bb25e1eb7b
  ```
  (`TOKEN_ONLY=true` is the cost guard — only real tokens run the paid build.)
- Generate a domain, then add custom domain `signals.prospectmachine.co` and
  create the CNAME it gives you at the domain's DNS.

## 4. Generate a link when a prospect replies
```
export MAGNET_BASE_URL=https://signals.prospectmachine.co
node add-prospect.js --first "John" --sender "John Smith" \
  --company "Acme Sales Coaching" --site "acmecoaching.co.uk" \
  --email "john@acmecoaching.co.uk"
```
Writes to Supabase (live site sees it instantly) and prints the link to send.
Add `--local` to write `prospects.json` instead (offline/dev).

## Notes
- Secrets and PII (`.env`, `prospects.json`, `emails.json`) are gitignored.
- Creds are read from Railway env vars in prod; from
  `../../intent-engine-marketing/.env` in local dev.
