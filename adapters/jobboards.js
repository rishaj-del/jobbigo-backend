// Job-board adapters: Indeed, Wellfound, Upwork, Behance, Dribbble.
// Indeed: publisher API / job search API. Wellfound: startup job API.
// Upwork: official API (OAuth). Behance/Dribbble: creative job boards + APIs.
// Each board gets its own module; they share the normalizer.
const { normalize } = require('./_normalize');

const BOARDS = ['indeed', 'wellfound', 'upwork', 'behance', 'dribbble'];

async function fetchJobs() {
  const now = Date.now();
  return [
    normalize({
      id: 'wf-1',
      title: 'Creative Technologist',
      company: 'AI Studio',
      location: 'Berlin',
      remote: true,
      type: 'Full-time',
      salaryMin: 5000,
      salaryMax: 7000,
      source: 'wellfound',
      postedAt: new Date(now - 58 * 60_000).toISOString(),
      contact: { email: 'hello@aistudio.example' },
    }),
    normalize({
      id: 'up-1',
      title: 'AI Filmmaker',
      company: 'Content Agency',
      remote: true,
      type: 'Freelance',
      salaryMin: 800,
      salaryMax: 1500,
      source: 'upwork',
      postedAt: new Date(now - 72 * 60_000).toISOString(),
    }),
  ];
}

module.exports = { fetchJobs, BOARDS };
