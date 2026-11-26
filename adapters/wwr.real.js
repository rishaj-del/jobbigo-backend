// DRAFT adapter: We Work Remotely — RSS (no key, no auth).
// Status: DRAFT — not registered in adapters/index.js. Wiring needs approval:
//   1. mv adapters/wwr.real.js adapters/wwr.js
//   2. require + add to ADAPTERS in adapters/index.js
//   3. add 'wwr' to ENABLED_SOURCES
//
// Why WWR: oldest remote job board; per-category RSS feeds are public and
// keyless. Verified live 2026-10-07:
//   https://weworkremotely.com/categories/remote-design-jobs.rss (HTTP 200)
//
// Publisher rules (baked in):
//   - The channel declares <ttl>60</ttl>: this adapter never refetches faster
//     than once per hour (MIN_FETCH_MS). Respect the crawl budget.
//   - Listings must link back: every job carries sourceUrl (the original WWR
//     listing page) and source: 'wwr' so the frontend can badge attribution.
//   - Feed only. WWR job pages sit behind a Cloudflare challenge (403 to plain
//     fetch) — never scrape job pages.
//   - contact is always null: the feed carries no contact details, and we never
//     scrape emails/phones from listing pages (hard privacy boundary).
const { normalize } = require('./_normalize');

const FEEDS = (process.env.WWR_FEEDS ||
  'remote-design-jobs,remote-sales-and-marketing-jobs,remote-programming-jobs')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const USER_AGENT =
  process.env.WWR_USER_AGENT || 'jobbigo-backend/0.1.0 (+https://jobbigo.site)';

// Honor the channel's <ttl>60</ttl> crawl budget.
const MIN_FETCH_MS = 60 * 60 * 1000;
let lastFetchAt = 0;
let cachedJobs = [];

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(tag, block) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function mapType(t) {
  const s = (t || '').toLowerCase();
  if (s.includes('full')) return 'Full-time';
  if (s.includes('contract')) return 'Contract';
  if (s.includes('freelance')) return 'Freelance';
  if (s.includes('part')) return 'Part-time';
  return null;
}

async function fetchJobs() {
  if (Date.now() - lastFetchAt < MIN_FETCH_MS && cachedJobs.length) return cachedJobs;

  const settled = await Promise.allSettled(
    FEEDS.map(async (slug) => {
      const res = await fetch(`https://weworkremotely.com/categories/${slug}.rss`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml' },
        // No-timeout fetch hung for ~300s per cycle on 2026-11-13 afternoon
        // when the source stalled, blocking the whole collector loop.
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`WWR feed ${slug}: ${res.status}`);
      return res.text();
    })
  );
  const xmls = [];
  for (const [i, r] of settled.entries()) {
    if (r.status === 'fulfilled') xmls.push(r.value);
    else console.warn(`[wwr] skipping ${FEEDS[i]}: ${r.reason?.message || r.reason}`);
  }
  if (!xmls.length) throw new Error('WWR: all feeds failed');

  const jobs = [];
  const seen = new Set();
  for (const xml of xmls) {
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
    for (const [, block] of items) {
      const rawTitle = stripHtml(pick('title', block) || '');
      const link = pick('link', block);
      const pubDate = pick('pubDate', block);
      // RSS titles are "Company: Role".
      const split = rawTitle.indexOf(':');
      const company = split > 0 ? rawTitle.slice(0, split).trim() : 'Unknown';
      const role = split > 0 ? rawTitle.slice(split + 1).trim() : rawTitle;
      const id = `wwr-${String(link || '').split('/').pop() || `${Date.now()}-${jobs.length}`}`;
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push(
        normalize({
          id,
          title: role || rawTitle || 'Design role',
          company,
          location: pick('region', block) || 'Remote',
          remote: true,
          type: mapType(pick('type', block)),
          source: 'wwr',
          sourceUrl: link,
          postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          description: stripHtml(pick('description', block)).slice(0, 2000),
          contact: { email: null, phone: null }, // boundary: never scrape contacts
        })
      );
    }
  }
  jobs.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  lastFetchAt = Date.now();
  cachedJobs = jobs;
  return jobs;
}

module.exports = { fetchJobs, FEEDS };
