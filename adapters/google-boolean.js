// Google Boolean Search adapter — the "Boolean search on Google" pipeline.
// Finds PUBLIC hiring posts on LinkedIn and Instagram through Google's index,
// then lists them on JOBBIGO with a link back to the original post.
//
// HOW IT WORKS — provider priority: Brave first, then Google CSE, then SerpAPI.
//   Brave Search API (free-credit path, Nov 2026): $5 of free credits every
//     month (~1,000 searches). A payment card is required on file even for the
//     free credits (identity check only — no charge while under ~1,000/month).
//     Sign up at api-dashboard.search.brave.com, activate the Search plan,
//     set BRAVE_API_KEY in .env. Endpoint:
//     https://api.search.brave.com/res/v1/web/search with the key in the
//     X-Subscription-Token header. Freshness=pw (past week — Brave has no
//     3-day option); results carry page_age when known, which we parse into
//     postedAt so the store's 3-day prune stays honest.
//   Google Custom Search JSON API (official, free 100 queries/day):
//     Set GOOGLE_API_KEY + GOOGLE_CX in .env. NOTE: Google closed this API
//     to new customers on 2026-01-20 and discontinues it 2027-01-01 — a newly
//     created key is refused with 403 PERMISSION_DENIED (verified 2026-11-24).
//     Kept as fallback for older keys only.
//   OR SerpAPI (alternative, paid): set SERPAPI_KEY.
//
// WHAT IT DOES NOT DO (hard boundaries)
//   - No LinkedIn/Instagram login, no account, no scraping of those sites.
//     It only queries Google's public index and links back to the post.
//     LinkedIn out-of-network posts are reachable exactly this way: Google
//     indexes the public post, JOBBIGO never logs in.
//   - No contact harvesting: contact stays null unless the post's own snippet
//     is an official apply link. Apply details live on the original post.
//   - postedAt is usually unknown from search results — the store stamps
//     firstSeenAt when JOBBIGO first lists it, and "X min ago" is measured
//     from that honest timestamp.
//
// BUDGET (free-limit only — the user asked for no billing):
//   CSE free tier is 100 queries/day → cap 90/day, 1 run/hour, 4 queries/run.
//   Brave free credits are ~1,000 searches/month → cap 30/day, 1 run/3 hours,
//   4 queries/run (~900/month, inside the free credits).
//   The rotation cursor + daily counter persist in
//   data/google-boolean-state.json, so a backend restart never resets the
//   rotation or double-spends the budget.
//
// FRESHNESS: every query carries a 24-HOUR filter (separate "last 24 hours"
// filter on the Boolean search, added 2026-11-26 at the user's request):
// dateRestrict=d1 (CSE) / tbs=qdr:d1 (SerpAPI) / freshness=pd (Brave), so
// results are at most 24 hours old. Set GOOGLE_BOOLEAN_FRESHNESS=3d to go
// back to the 3-day window (d3 / qdr:d3 / pw). The store prunes unpinned
// jobs older than 3 days as well (see store.js).
//
// QUERY MATRIX: LinkedIn + Instagram x the AI-video/3D/motion roles, plus
// LinkedIn location specials for USA, Germany, Thailand, Saudi Arabia,
// Dubai, Qatar, Netherlands (the user's Boolean example, in valid Google
// syntax). Instagram coverage via Google is thin by nature — Google indexes
// very little Instagram content and stories are not indexed at all — so
// expect fewer Instagram hits than LinkedIn ones. There is no official API
// that returns every Instagram hiring post worldwide by keyword.
const fs = require('fs');
const path = require('path');
const { normalize } = require('./_normalize');

const STATE_PATH = path.join(__dirname, '..', 'data', 'google-boolean-state.json');
const QUERIES_PER_RUN = Number(process.env.GOOGLE_BOOLEAN_QUERIES_PER_RUN || 4);
const FRESHNESS = process.env.GOOGLE_BOOLEAN_FRESHNESS || '24h'; // '24h' or '3d'
const DATE_RESTRICT = FRESHNESS === '3d' ? 'd3' : 'd1'; // CSE: last 24h by default
const BRAVE_FRESHNESS = FRESHNESS === '3d' ? 'pw' : 'pd'; // Brave: past day by default
const SERP_TBS = FRESHNESS === '3d' ? 'qdr:d3' : 'qdr:d1'; // SerpAPI: last 24h by default

const PLATFORMS = [
  { source: 'linkedin', site: 'linkedin.com', label: 'LinkedIn' },
  { source: 'instagram', site: 'instagram.com', label: 'Instagram' },
];

const ROLES = [
  'AI video editor',
  'AI filmmaker',
  'AI UGC creator',
  'motion designer',
  '3D animator',
  'video editor',
  'UGC creator',
  'short form video editor',
  '3D artist',
  'graphic designer',
  'AI VFX artist',
  'creative technologist',
];

const LOCATIONS = ['USA', 'Germany', 'Thailand', 'Saudi Arabia', 'Dubai', 'Qatar', 'Netherlands'];

function buildMatrix() {
  const out = [];
  for (const p of PLATFORMS) {
    for (const role of ROLES) {
      out.push({
        platform: p,
        role,
        query:
          p.source === 'linkedin'
            ? `site:linkedin.com hiring "${role}" (freelance OR remote)`
            : `site:instagram.com hiring "${role}" (freelance OR remote)`,
      });
    }
  }
  // LinkedIn location specials — the user's Boolean example, valid Google syntax.
  const loc = LOCATIONS.map((l) => (l.includes(' ') ? `"${l}"` : l)).join(' OR ');
  out.push({
    platform: PLATFORMS[0],
    role: 'video editor (locations)',
    query: `site:linkedin.com hiring "video editor" freelance remote (${loc})`,
  });
  out.push({
    platform: PLATFORMS[0],
    role: 'motion designer / 3D animator (locations)',
    query: `site:linkedin.com hiring ("motion designer" OR "3D animator") freelance remote (${loc})`,
  });
  return out;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { dayKey: '', queriesToday: 0, lastRunAt: 0, cursor: 0 };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function searchCSE(query) {
  const { GOOGLE_API_KEY, GOOGLE_CX } = process.env;
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}` +
    `&cx=${encodeURIComponent(GOOGLE_CX)}&q=${encodeURIComponent(query)}&num=10` +
    `&dateRestrict=${DATE_RESTRICT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google CSE: ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: it.title,
    link: it.link,
    snippet: it.snippet || '',
  }));
}

async function searchSerpApi(query) {
  const url =
    `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}` +
    `&api_key=${encodeURIComponent(process.env.SERPAPI_KEY)}&num=10&tbs=${SERP_TBS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI: ${res.status}`);
  const data = await res.json();
  return (data.organic_results || []).map((it) => ({
    title: it.title,
    link: it.link,
    snippet: it.snippet || '',
  }));
}

async function searchBrave(query) {
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
    `&count=10&freshness=${BRAVE_FRESHNESS}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
  });
  if (!res.ok) throw new Error(`Brave: ${res.status}`);
  const data = await res.json();
  return ((data.web && data.web.results) || []).map((it) => ({
    title: it.title,
    link: it.url,
    snippet: it.description || '',
    pageAge: it.page_age || null,
  }));
}

// Brave returns page_age like "3 days ago" — parse it into a postedAt so the
// store's 3-day prune stays honest. Returns null when unknown.
function parsePageAge(pageAge) {
  if (!pageAge) return null;
  const m = String(pageAge).match(/(\d+)\s*(hour|day|week|month)s?\s*ago/i);
  if (!m) return null;
  const ms = { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 }[
    m[2].toLowerCase()
  ];
  if (!ms) return null;
  return new Date(Date.now() - Number(m[1]) * ms).toISOString();
}

function toJob(result, platform, role) {
  const url = result.link || '';
  const id = `gb-${platform.source}-${Buffer.from(url).toString('base64url').slice(0, 24)}`;
  return normalize({
    id,
    title: (result.title || '').replace(/\s*\|.*$/, '').trim() || `${role} role`,
    company: null,
    location: null,
    remote: /remote|worldwide/i.test(`${result.title} ${result.snippet}`),
    type: null,
    source: platform.source,
    sourceUrl: url,
    postedAt: parsePageAge(result.pageAge), // Brave page_age; null for CSE/SerpAPI (store stamps firstSeenAt)
    description: (result.snippet || '').slice(0, 500),
    contact: { email: null, phone: null },
  });
}

async function fetchJobs() {
  // Provider priority: Brave (free credits) > Google CSE > SerpAPI.
  const provider = process.env.BRAVE_API_KEY
    ? 'brave'
    : process.env.GOOGLE_API_KEY
      ? 'cse'
      : process.env.SERPAPI_KEY
        ? 'serpapi'
        : null;
  if (!provider) {
    console.warn('[google-boolean] no BRAVE_API_KEY, GOOGLE_API_KEY/GOOGLE_CX or SERPAPI_KEY — dry mode, 0 jobs');
    return [];
  }
  // Free-limit caps per provider (user: free limit only, no billing).
  const maxPerDay = provider === 'brave' ? 30 : 90; // Brave ~1,000/mo free credits; CSE 100/day free
  const minIntervalMs = provider === 'brave' ? 3 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const state = loadState();
  const today = todayKey();
  if (state.dayKey !== today) {
    state.dayKey = today;
    state.queriesToday = 0;
  }
  if (Date.now() - (state.lastRunAt || 0) < minIntervalMs) return []; // run gate
  if (state.queriesToday >= maxPerDay) {
    console.warn(`[google-boolean] daily free budget spent (${maxPerDay} queries) — dry until tomorrow`);
    return [];
  }
  const matrix = buildMatrix();
  const budget = Math.min(QUERIES_PER_RUN, maxPerDay - state.queriesToday);
  const queries = [];
  for (let i = 0; i < budget; i++) {
    queries.push(matrix[state.cursor % matrix.length]);
    state.cursor += 1;
  }
  state.lastRunAt = Date.now();
  state.queriesToday += queries.length;
  saveState(state);

  const search = provider === 'brave' ? searchBrave : provider === 'cse' ? searchCSE : searchSerpApi;
  const jobs = [];
  const seen = new Set();
  for (const q of queries) {
    try {
      const results = await search(q.query);
      for (const r of results) {
        const job = toJob(r, q.platform, q.role);
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        jobs.push(job);
      }
    } catch (err) {
      console.warn(`[google-boolean] ${q.query}: ${err.message}`);
    }
  }
  return jobs;
}

module.exports = { fetchJobs, buildMatrix, searchBrave, parsePageAge };
