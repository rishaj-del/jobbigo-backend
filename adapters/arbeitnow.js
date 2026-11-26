// Arbeitnow adapter — REAL, keyless, public JSON API.
// Verified live 2026-11-13: https://www.arbeitnow.com/api/job-board-api
// returns 300 jobs with title, company_name, url, created_at (unix s),
// remote flag, job_types, location, tags. No key, no auth.
// Poll floor: 15 min (their data refreshes slower than that anyway).
// Contact is always null — the API publishes no contact details.
const { normalize } = require('./_normalize');

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
const USER_AGENT = process.env.ARBEITNOW_USER_AGENT || 'jobbigo-backend/0.1.0';

const MIN_FETCH_MS = 15 * 60 * 1000;
let lastFetchAt = 0;
let cachedJobs = [];

function mapType(types) {
  const s = (types || []).join(' ').toLowerCase();
  if (s.includes('full')) return 'Full-time';
  if (s.includes('contract')) return 'Contract';
  if (s.includes('freelance')) return 'Freelance';
  if (s.includes('part')) return 'Part-time';
  if (s.includes('intern')) return 'Internship';
  return null;
}

async function fetchJobs() {
  if (Date.now() - lastFetchAt < MIN_FETCH_MS && cachedJobs.length) return cachedJobs;
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    // No-timeout fetch hung for ~300s per cycle on 2026-11-13 afternoon
    // when the source stalled, blocking the whole collector loop.
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Arbeitnow: ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  const jobs = items.map((j) =>
    normalize({
      id: `arbeitnow-${j.slug}`,
      title: j.title || 'Role',
      company: j.company_name || 'Unknown',
      location: j.location || null,
      remote: Boolean(j.remote),
      type: mapType(j.job_types),
      source: 'arbeitnow',
      sourceUrl: j.url,
      postedAt: j.created_at
        ? new Date(j.created_at * 1000).toISOString()
        : new Date().toISOString(),
      description: String(j.description || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000),
      contact: { email: null, phone: null },
    })
  );
  jobs.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  lastFetchAt = Date.now();
  cachedJobs = jobs;
  return jobs;
}

module.exports = { fetchJobs };
