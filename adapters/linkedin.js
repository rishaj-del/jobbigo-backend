// LinkedIn adapter.
// Real options: LinkedIn Jobs API (requires partnership), official
// "Apply with LinkedIn" integrations, or an approved data provider.
// Screen-scraping LinkedIn violates its ToS — don't.
const { normalize } = require('./_normalize');

async function fetchJobs() {
  const now = Date.now();
  return [
    normalize({
      id: 'li-1',
      title: 'Motion Designer',
      company: 'Creative Studio',
      location: 'London',
      remote: true,
      type: 'Full-time',
      source: 'linkedin',
      postedAt: new Date(now - 12 * 60_000).toISOString(),
      contact: { email: 'talent@creativestudio.example' },
    }),
  ];
}

module.exports = { fetchJobs };
