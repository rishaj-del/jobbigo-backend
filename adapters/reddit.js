// Reddit adapter.
// Poll r/forhire, r/jobbit, r/DesignJobs etc. via the Reddit API (OAuth)
// or pushshift-style mirrors. Respect rate limits and subreddit rules.
const { normalize } = require('./_normalize');

async function fetchJobs() {
  const now = Date.now();
  return [
    normalize({
      id: 'rd-1',
      title: 'Graphic Designer',
      company: 'D2C Brand',
      remote: true,
      type: 'Contract',
      salaryMin: 1200,
      salaryMax: 2500,
      source: 'reddit',
      postedAt: new Date(now - 47 * 60_000).toISOString(),
    }),
  ];
}

module.exports = { fetchJobs };
