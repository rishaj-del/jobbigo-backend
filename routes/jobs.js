const express = require('express');
const { getJobs, minutesAgo } = require('../adapters');
const store = require('../store');

const router = express.Router();

// GET /api/jobs?category=&source=&remote=true&q=
// Serves the collector's store (real-time: refreshed every COLLECTOR_INTERVAL_MS).
// "minutesAgo" is measured from the source's postedAt when available,
// otherwise from firstSeenAt — the moment JOBBIGO first listed it.
router.get('/', async (req, res) => {
  try {
    const { category, source, remote, q } = req.query;
    const { jobs, updatedAt } = await getJobs();
    let out = jobs;

    if (source) {
      const wanted = source.split(',').map((s) => s.trim().toLowerCase());
      out = out.filter((j) => wanted.includes(j.source));
    }
    if (remote === 'true') out = out.filter((j) => j.remote);
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter((j) =>
        `${j.title} ${j.company} ${j.description}`.toLowerCase().includes(needle)
      );
    }
    if (category) {
      const needle = category.toLowerCase();
      out = out.filter((j) => j.title.toLowerCase().includes(needle));
    }

    res.json({
      count: out.length,
      updatedAt,
      jobs: out.map((j) => ({ ...j, minutesAgo: minutesAgo(j) })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/status — pipeline health: last collect, per-source counts.
router.get('/status', (req, res) => {
  const { jobs, updatedAt } = store.getAll();
  const bySource = {};
  for (const j of jobs) bySource[j.source] = (bySource[j.source] || 0) + 1;
  res.json({ total: jobs.length, updatedAt, bySource });
});

// GET /api/jobs/sources
router.get('/sources', (req, res) => {
  res.json({
    sources: [
      'arbeitnow',
      'remotive',
      'wwr',
      'reddit',
      'linkedin',
      'instagram',
      'facebook',
      'x',
      'indeed',
      'wellfound',
      'angellist',
      'upwork',
      'behance',
      'dribbble',
      'company-career-pages',
      'creator-communities',
      'public-job-boards',
    ],
  });
});

module.exports = router;
