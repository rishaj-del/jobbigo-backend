// JOBBIGO collector — the real-time pipeline.
// Runs every COLLECTOR_INTERVAL_MS (default 5 min) and on demand:
//   1. Fans out to the enabled REAL adapters (each enforces its own poll
//      floor / ToS guard, so a fast tick never hammers a source).
//   2. Merges + dedupes into the persistent store (data/jobs.json) with a
//      firstSeenAt stamp, so "X min ago" is always honest.
//   3. The API serves the store; the frontend polls the API every 60s, so a
//      job posted on LinkedIn and picked up by the Google Boolean search
//      appears on the site within one collector cycle.
//
// Sources (see each adapter's header for ToS + setup):
//   arbeitnow      keyless JSON API, 15-min floor — freshest board feed
//   remotive       keyless JSON API, 6h floor (ToS: max ~4 req/day), 24h delay by design
//   wwr            public RSS, 1h floor (channel <ttl>60</ttl>)
//   reddit         official OAuth API, needs free REDDIT_CLIENT_ID/SECRET
//   google-boolean Google Custom Search (or SerpAPI) over public hiring posts
//                  on LinkedIn / Instagram / Facebook / X — key required
//
// Run once:   node collector.js --once
// Run server: npm start (starts the API + the collector loop)
require('dotenv').config();
const store = require('./store');

const SOURCES = [
  { name: 'arbeitnow', mod: './adapters/arbeitnow' },
  { name: 'remotive', mod: './adapters/remotive.real' },
  { name: 'wwr', mod: './adapters/wwr.real' },
  { name: 'reddit', mod: './adapters/reddit.real' },
  { name: 'google-boolean', mod: './adapters/google-boolean' },
];

const INTERVAL_MS = Number(process.env.COLLECTOR_INTERVAL_MS || 5 * 60 * 1000);

async function collectOnce() {
  const started = Date.now();
  const results = await Promise.allSettled(
    SOURCES.map(async ({ name, mod }) => {
      const adapter = require(mod);
      const jobs = await adapter.fetchJobs();
      return { name, count: jobs.length, jobs };
    })
  );
  let totalNew = 0;
  const summary = {};
  for (const [i, r] of results.entries()) {
    const name = SOURCES[i].name;
    if (r.status === 'fulfilled') {
      const { added, updated, total } = store.upsert(r.value.jobs);
      totalNew += added;
      summary[name] = { fetched: r.value.count, added, updated, total };
    } else {
      summary[name] = { error: r.reason?.message || String(r.reason) };
      console.warn(`[collector] ${name} failed: ${r.reason?.message || r.reason}`);
    }
  }
  console.log(
    `[collector] ${new Date().toISOString()} +${totalNew} new jobs in ${Date.now() - started}ms`,
    JSON.stringify(summary)
  );
  return summary;
}

function startLoop() {
  console.log(`[collector] loop started, every ${INTERVAL_MS / 1000}s`);
  collectOnce().catch((e) => console.error('[collector] initial run failed:', e.message));
  const timer = setInterval(() => {
    collectOnce().catch((e) => console.error('[collector] run failed:', e.message));
  }, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

if (require.main === module) {
  const once = process.argv.includes('--once');
  collectOnce()
    .then(() => {
      if (once) process.exit(0);
      startLoop();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { collectOnce, startLoop, SOURCES };
