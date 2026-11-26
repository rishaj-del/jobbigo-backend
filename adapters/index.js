// Aggregator: serves the persistent store (written by the collector), with a
// live-fetch fallback when the store is still empty (first boot).
// Real adapters only — the old sample stubs (instagram/linkedin/x/jobboards)
// are NOT wired here; they exist as shape references.
const store = require('../store');

const arbeitnow = require('./arbeitnow');
const remotive = require('./remotive.real');
const wwr = require('./wwr.real');
const reddit = require('./reddit.real');
const googleBoolean = require('./google-boolean');

const ADAPTERS = { arbeitnow, remotive, wwr, reddit, 'google-boolean': googleBoolean };

function effectiveDate(job) {
  return job.postedAt || job.firstSeenAt || new Date(0).toISOString();
}

async function getJobs() {
  const { jobs, updatedAt } = store.getAll();
  if (jobs.length) return { jobs, updatedAt, live: true };
  // First boot / empty store: fetch live once so the API is never empty.
  const enabled = (process.env.ENABLED_SOURCES || 'arbeitnow,remotive,wwr')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const results = await Promise.allSettled(
    enabled.map((name) =>
      ADAPTERS[name] ? ADAPTERS[name].fetchJobs() : Promise.resolve([])
    )
  );
  const live = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => new Date(effectiveDate(b)) - new Date(effectiveDate(a)));
  if (live.length) store.upsert(live);
  return { jobs: live, updatedAt: new Date().toISOString(), live: false };
}

function minutesAgo(job) {
  const d = new Date(effectiveDate(job)).getTime();
  if (!d) return null;
  return Math.max(0, Math.round((Date.now() - d) / 60_000));
}

module.exports = { getJobs, minutesAgo, effectiveDate, ADAPTERS };
