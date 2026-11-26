// X (Twitter) adapter.
// Use the X API v2 filtered stream with hiring keywords
// (e.g. "hiring video editor", "looking for motion designer").
// Needs a Bearer Token from the X developer portal.
const { normalize } = require('./_normalize');

async function fetchJobs() {
  const now = Date.now();
  return [
    normalize({
      id: 'x-1',
      title: 'AI VFX Artist',
      company: 'Indie Film Collective',
      remote: true,
      type: 'Freelance',
      salaryMin: 1500,
      salaryMax: 3000,
      source: 'x',
      postedAt: new Date(now - 33 * 60_000).toISOString(),
    }),
  ];
}

module.exports = { fetchJobs };
