// Instagram adapter.
// NOTE: Meta offers no public "firehose" of every hiring post. Real options:
//  1. Instagram Graph API hashtag search (business/creator accounts, rate-limited)
//  2. A social-listening provider (e.g. Brandwatch, Brand24) with keyword alerts
//     for hiring phrases, piped into this adapter via webhook.
//  3. Manual curation queue for priority accounts.
// Wire the chosen feed into fetchJobs() below; keep the normalized shape.
const { normalize } = require('./_normalize');

async function fetchJobs() {
  // TODO: replace sample data with live feed.
  const now = Date.now();
  return [
    normalize({
      id: 'ig-1',
      title: 'AI Video Editor',
      company: 'Stealth AI Startup',
      remote: true,
      type: 'Contract',
      salaryMin: 2000,
      salaryMax: 4000,
      source: 'instagram',
      postedAt: new Date(now - 4 * 60_000).toISOString(),
      contact: { email: 'hiring@stealthai.example' },
      description: 'Short-form AI video content for launch campaign.',
    }),
    normalize({
      id: 'ig-2',
      title: '3D Artist',
      company: 'Gaming Startup',
      remote: true,
      type: 'Full-time',
      source: 'instagram',
      postedAt: new Date(now - 21 * 60_000).toISOString(),
      contact: { email: 'jobs@gamingstartup.example' },
    }),
  ];
}

module.exports = { fetchJobs };
