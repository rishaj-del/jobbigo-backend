// DRAFT adapter: Remotive API — creative categories (no key, no auth).
// Status: DRAFT — not registered in adapters/index.js. Wiring needs approval:
//   1. mv adapters/remotive.real.js adapters/remotive.js
//   2. require + add to ADAPTERS in adapters/index.js
//   3. add 'remotive' to ENABLED_SOURCES
//
// Why Remotive: public JSON API, keyless, structured fields (remote
// eligibility, category, salary text). Verified live 2026-10-07:
//   https://remotive.com/api/remote-jobs?category=design (HTTP 200)
//
// REMOTIVE TERMS OF SERVICE (from their API legal notice — read before wiring):
//   - You MAY share their jobs further, but must LINK BACK to the job URL on
//     Remotive AND MENTION Remotive as the source. Every job here carries
//     sourceUrl (the Remotive listing) and source: 'remotive' for the badge.
//   - Do NOT submit Remotive jobs to third-party job sites wholesale without
//     that attribution, and do NOT gate listings behind signup/email capture.
//   - Poll at most ~4 TIMES A DAY — excessive requests get blocked. This adapter
//     enforces a 6-hour minimum between fetches (MIN_FETCH_MS). Do NOT drop
//     this guard when wiring in, and do not run it under the server's default
//     60s cache TTL — fetch on a timer (e.g. every 6h) or accept stale cache.
//   - Listings are delayed 24h by design, to attribute jobs to Remotive.
//   - Paid private API exists for higher volume: hello(at)remotive(dot)io.
//
// PRIVACY: contact stays null. Descriptions are republished content — extracting
// emails/phones from them is harvesting, not "published by the poster". Hard no.
const { normalize } = require('./_normalize');

const CATEGORIES = (process.env.REMOTIVE_CATEGORIES || 'design,marketing')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const USER_AGENT =
  process.env.REMOTIVE_USER_AGENT || 'jobbigo-backend/0.1.0 (+https://jobbigo.site)';

// Remotive ToS: max ~4 requests/day. 6h floor = 4 fetches/day, safely under.
const MIN_FETCH_MS = 6 * 60 * 60 * 1000;
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

function mapType(jobType) {
  const s = (jobType || '').toLowerCase();
  if (s.includes('full')) return 'Full-time';
  if (s.includes('contract')) return 'Contract';
  if (s.includes('freelance')) return 'Freelance';
  if (s.includes('part')) return 'Part-time';
  if (s.includes('intern')) return 'Internship';
  return null;
}

// Salary strings like "$45-$120/Hour", "$80k-$120k", "£50,000 - £70,000 / year".
function parseSalary(raw) {
  const s = String(raw || '');
  const nums = [...s.matchAll(/[$£€]?\s*([\d,]+(?:\.\d+)?)\s*(k)?/gi)].map((m) => {
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]) n *= 1000;
    return n;
  });
  if (!nums.length) return { salaryMin: null, salaryMax: null, currency: 'USD', salaryPeriod: 'mo', raw: s };
  const period = /hour|\/hr\b/i.test(s) ? 'hr'
    : /month|\/mo\b/i.test(s) ? 'mo'
    : /year|\/yr\b|annual/i.test(s) ? 'yr'
    : 'mo';
  const currency = /£/.test(s) ? 'GBP' : /€/.test(s) ? 'EUR' : 'USD';
  return {
    salaryMin: Math.min(...nums),
    salaryMax: nums.length > 1 ? Math.max(...nums) : null,
    currency,
    salaryPeriod: period,
    raw: s,
  };
}

async function fetchJobs() {
  if (Date.now() - lastFetchAt < MIN_FETCH_MS && cachedJobs.length) return cachedJobs;

  const all = [];
  const seen = new Set();
  for (const category of CATEGORIES) {
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`,
      {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        // No-timeout fetch hung for ~300s per cycle on 2026-11-13 afternoon
        // when a source stalled, blocking the whole collector loop.
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) throw new Error(`Remotive ${category}: ${res.status}`);
    const data = await res.json();
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    for (const j of jobs) {
      const id = `remotive-${j.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const sal = parseSalary(j.salary);
      // publication_date has no timezone suffix ("2026-10-05T05:15:43") — treat as UTC.
      const pub = j.publication_date ? `${j.publication_date}Z` : null;
      all.push(
        normalize({
          id,
          title: j.title || 'Remote role',
          company: j.company_name || 'Unknown',
          location: j.candidate_required_location || 'Remote',
          remote: true,
          type: mapType(j.job_type),
          salaryMin: sal.salaryMin,
          salaryMax: sal.salaryMax,
          currency: sal.currency,
          salaryPeriod: sal.salaryPeriod,
          source: 'remotive',
          sourceUrl: j.url, // ToS: always link back to the Remotive listing
          postedAt: pub || new Date().toISOString(),
          description:
            (sal.salaryMin == null && sal.raw
              ? `Advertised salary: ${sal.raw}\n\n`
              : '') + stripHtml(j.description).slice(0, 2000),
          contact: { email: null, phone: null }, // boundary: never harvest contacts
        })
      );
    }
  }
  all.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  lastFetchAt = Date.now();
  cachedJobs = all;
  return all;
}

module.exports = { fetchJobs, CATEGORIES };
