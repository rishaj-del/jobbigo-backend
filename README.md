# JOBBIGO Backend — real-time job aggregation API

Express + per-source adapters + a collector that keeps `data/jobs.json` fresh.
The frontend polls `GET /api/jobs` every 60s, so new listings appear on the
site within one collector cycle.

## Quick start

```bash
cd jobbigo-backend
npm install
cp .env.example .env   # optional: add keys for Reddit + Google Boolean search
npm run collect        # one live collection run (writes data/jobs.json)
npm start              # API on http://localhost:4000 + collector loop
```

## How real-time works

```
sources ──► collector (every 5 min) ──► data/jobs.json ──► GET /api/jobs
              (each source enforces        (dedupe + firstSeenAt)   (frontend polls 60s)
               its own poll floor)
```

- **Collector** (`collector.js`): fans out to the real adapters, merges and
  dedupes by job id, stamps `firstSeenAt` the first time JOBBIGO lists a job.
- **"X min ago"**: measured from the source's `postedAt` when available,
  otherwise from `firstSeenAt` — honest either way, never invented.
- **API**: `GET /api/jobs` serves the store (fast, no per-request scraping).
  `GET /api/jobs/status` shows last collect time + per-source counts.

## Endpoints

| Method | Path              | Description                              |
| ------ | ----------------- | ---------------------------------------- |
| GET    | /api/health       | Service status                           |
| GET    | /api/jobs         | Live feed. Filters: `category`, `source`, `remote=true`, `q` |
| GET    | /api/jobs/status  | Pipeline health: total, updatedAt, bySource |
| GET    | /api/jobs/sources | Supported source list                    |
| POST   | /api/alerts       | Save a job alert (stub — wire to your DB)|

Example: `GET /api/jobs?source=arbeitnow,remotive&remote=true&q=video`

Job shape: `id, title, company, location, remote, type, salaryMin/Max,
currency, salaryPeriod, source, sourceUrl, postedAt, firstSeenAt, minutesAgo,
contact { email, phone }, description`.

## Freshness, honestly

| Source | How fresh | Setup |
| ------ | --------- | ----- |
| Arbeitnow | minutes–hours (real `created_at`) | none — keyless, live now |
| We Work Remotely (RSS) | hourly (`<ttl>60</ttl>`) | none — keyless, live now |
| Remotive | delayed 24h by design, 6h poll floor (ToS) | none — keyless, live now |
| Reddit (r/forhire, r/DesignJobs…) | minutes (real `created_utc`) | free OAuth app, 5 min |
| Google Boolean search → LinkedIn / Instagram / Facebook / X public posts | same-day posts, found via Google's index | free Google CSE key + CX (100 queries/day) |

A "5 minutes ago" LinkedIn post can only appear that fast through the
Google Boolean search adapter (or a social-listening provider) — no public
API streams LinkedIn/Instagram/Facebook/X posts in real time, and scraping
those sites with a login violates their ToS. The adapter queries Google's
public index and links back to the original post for apply details.

## Going live: what each source really needs

- **Arbeitnow / Remotive / WWR** — keyless, already wired. Respect their
  poll floors (baked into the adapters).
- **Reddit** — free script app at reddit.com/prefs/apps; set
  `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
- **Google Boolean search** — create a Programmable Search Engine with
  "Search the entire web" enabled, get an API key, set `GOOGLE_API_KEY` +
  `GOOGLE_CX` (or `SERPAPI_KEY` as an alternative).
- **LinkedIn** — official Jobs API requires partnership; use an approved data
  provider. Do not scrape — it violates the ToS.
- **X** — API v2 filtered stream needs a paid tier.
- **Indeed / Wellfound / Upwork / Behance / Dribbble** — official APIs or
  approved feeds; see `adapters/` header comments.

## Contact details — important

Only store contact info the poster published publicly (business emails, hiring
forms). Harvesting private phone numbers at scale violates platform ToS and
privacy law (GDPR / DPDP). The `contact` field is intentionally null unless a
source API provides a dedicated contact/apply field.

## Deploy

Any Node host works: Railway, Render, Fly.io, or a VPS with PM2.
Set env vars from `.env.example`. Point the frontend's live feed at
`https://your-api/api/jobs` (set `CONFIG.apiBase` in the site).
