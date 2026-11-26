# JOBBIGO — Deploy checklist (prepared 2026-11-13)

Goal: make the public site show the live feed instead of demo data.
Nothing here deploys anything or spends money — it is the checklist for when
Rishaj says go.

## Verified state (2026-11-13 ~09:18 UTC)

- Backend collector last ran **08:58:20 UTC**, wrote 500 jobs to
  `data/jobs.json` (Arbeitnow 378, WWR 110, Remotive 12). Freshest
  `postedAt` in the file: 2026-11-13T07:45:24Z.
- No Node process is running in this workspace now and
  `http://localhost:4000/api/jobs/status` does not answer from here.
  The site's `CONFIG.apiBase` is `http://localhost:4000`, which from a
  visitor's browser means the visitor's own machine — so public visitors
  currently see demo data, exactly as the 2026-11-13 delivery message said.
- Google Boolean search (LinkedIn / Instagram / Facebook / X) is in dry
  mode: no `GOOGLE_API_KEY` / `GOOGLE_CX` set. Reddit adapter is off:
  no `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`. Both are optional for
  launch — the three keyless sources already work.

## Step 1 — Put the backend on an always-on host

Any Node host works (Railway, Render, Fly.io, a VPS with PM2).
Pick one that stays awake: a host that sleeps after inactivity will stall
the 5-minute collector loop, so check the current free-tier sleep
behaviour before choosing a free tier.

- Start command: `npm start` (listens on `$PORT`, defaults to 4000).
- Env vars: copy from `.env.example`. Minimum for launch: none — the
  three keyless sources run with no keys. Add the Google / Reddit keys
  later to switch those adapters on.
- Health check after deploy: `GET https://<your-host>/api/jobs/status`
  should show `total: 500` (growing) and a recent `updatedAt`.

## Step 2 — Point the frontend at it

In the site source (`ts-spaces/jobbigo/index.html`, line 1163):

```js
var CONFIG={apiBase:"http://localhost:4000"};
```

Change to:

```js
var CONFIG={apiBase:"https://<your-host>"};
```

(no trailing slash, no `/api` suffix — the site appends `/api/jobs` itself).
Rebuild / re-share the artifact so the public link picks up the new
version; the current public link still shows the pre-real-time version.

## Step 3 — Verify from a visitor's point of view

- Open the public link in a fresh browser: the LIVE badge should show,
  jobs should carry real "X min ago" times, and no "Demo data" label.
- `GET https://<your-host>/api/jobs?q=video` should return real video
  jobs with source links.

## Optional later — switch on the social adapters

- Google CSE: create a Programmable Search Engine with "Search the
  entire web", set `GOOGLE_API_KEY` + `GOOGLE_CX` (100 queries/day free).
- Reddit: free script app at reddit.com/prefs/apps, set
  `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`.
- After adding keys, restart the backend and watch one collector cycle
  in the logs for `google-boolean` / `reddit` counts above 0.
