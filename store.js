// Persistent job store: data/jobs.json
// The collector upserts normalized jobs by id, stamps firstSeenAt the first
// time JOBBIGO lists a job, keeps the newest 800, and writes atomically
// (temp file + rename) so the API never reads a half-written file.
// Handpicked jobs (handpicked: true) are pinned outside the cap, so a flood
// of new listings can never trim a curated role out of the feed.
//
// Freshness rule: "X min ago" = postedAt when the source gives a real date,
// otherwise firstSeenAt (honest: "listed on JOBBIGO X min ago").
// Live-feed age rule (2026-11-24): unpinned jobs older than 3 days are
// pruned on every upsert — the live feed never shows anything older than
// 3 days. Pinned Handpicked jobs are exempt: they are curated, not live
// feed, and the pin fix of 2026-11-21 protects them.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'jobs.json');
const SEED_PATH = path.join(DATA_DIR, 'handpicked-seed.json');
const MAX_JOBS = 800; // raised 2026-11-20 so curated handpicked jobs are not trimmed out the same day
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // live feed: max 3 days old

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const store = Array.isArray(parsed.jobs) ? parsed : { jobs: [], updatedAt: null };
    return ensureSeeded(store);
  } catch {
    return ensureSeeded({ jobs: [], updatedAt: null });
  }
}

// Deploy safety (2026-11-26): the 8 curated Handpicked roles live in
// data/handpicked-seed.json, which ships with the repo. On every read, any
// seeded role missing from jobs.json is merged back in — so a fresh deploy
// or a wiped volume can never lose them. The merge persists when the
// filesystem is writable; on a read-only FS the in-memory copy still serves.
let seedCache = null;
function loadSeed() {
  if (seedCache) return seedCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    seedCache = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    seedCache = [];
  }
  return seedCache;
}

function ensureSeeded(store) {
  const seed = loadSeed();
  if (!seed.length) return store;
  const ids = new Set(store.jobs.map((j) => j.id));
  const missing = seed.filter((j) => !ids.has(j.id));
  if (!missing.length) return store;
  const seeded = { jobs: [...store.jobs, ...missing], updatedAt: store.updatedAt };
  try {
    writeStore(seeded);
  } catch {
    // read-only FS: the in-memory copy still serves the seeded roles
  }
  return seeded;
}

function writeStore(store) {
  ensureDir();
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

// Upsert jobs: keep existing firstSeenAt, stamp new ones with now.
function upsert(incoming) {
  const store = readStore();
  const now = new Date().toISOString();
  const byId = new Map(store.jobs.map((j) => [j.id, j]));
  let added = 0;
  let updated = 0;
  for (const job of incoming) {
    const existing = byId.get(job.id);
    if (existing) {
      byId.set(job.id, { ...existing, ...job, firstSeenAt: existing.firstSeenAt });
      updated += 1;
    } else {
      byId.set(job.id, { ...job, firstSeenAt: job.firstSeenAt || now });
      added += 1;
    }
  }
  // Pinned first: handpicked jobs are exempt from the cap, so a flood of new
  // listings can never push a curated role out (2026-11-21: 4 of the 8
  // handpicked roles were trimmed within a day of the cap going 500 -> 800,
  // because their postedAt dates were the oldest in the store).
  const sorted = [...byId.values()]
    .sort((a, b) => new Date(effectiveDate(b)) - new Date(effectiveDate(a)));
  const cutoff = Date.now() - MAX_AGE_MS;
  const jobs = [
    ...sorted.filter((j) => j.handpicked),
    ...sorted
      .filter((j) => !j.handpicked && new Date(effectiveDate(j)).getTime() >= cutoff)
      .slice(0, MAX_JOBS),
  ];
  writeStore({ jobs, updatedAt: now });
  return { added, updated, total: jobs.length };
}

function effectiveDate(job) {
  return job.postedAt || job.firstSeenAt || job.updatedAt || new Date(0).toISOString();
}

function getAll() {
  return readStore();
}

module.exports = { readStore, writeStore, upsert, getAll, effectiveDate, STORE_PATH };
