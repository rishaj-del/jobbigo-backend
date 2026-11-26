// Reddit adapter — REAL implementation (drop-in replacement for reddit.js).
//
// Why Reddit first: it is the only promised source with a FREE official read
// API. LinkedIn needs a partnership, X needs a paid tier, Indeed/Wellfound/
// Behance have no usable public API, and Instagram hashtag search needs a
// Facebook Page-linked IG Business account + Meta App Review.
//
// Setup (5 minutes, free):
//   1. Log in to reddit.com -> https://www.reddit.com/prefs/apps -> "create another app..."
//   2. Type: script. Name anything (e.g. jobbigo). Redirect URI: http://localhost:4000
//   3. Copy the client id (short string under the name) and the secret.
//   4. Put them in .env: REDDIT_CLIENT_ID=..., REDDIT_CLIENT_SECRET=...
//   5. Swap in: mv adapters/reddit.js adapters/reddit.stub.js && mv adapters/reddit.real.js adapters/reddit.js
//
// Then restart the server. /api/jobs?source=reddit returns real posts with
// real postedAt times, so "X min ago" on the site becomes honest.
const { normalize } = require('./_normalize');

const SUBREDDITS = (process.env.REDDIT_SUBREDDITS || 'forhire,DesignJobs,jobbit')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const USER_AGENT =
  process.env.REDDIT_USER_AGENT || 'web:jobbigo-backend:0.1.0 (by /u/jobbigo)';

const HIRING_RE = /\bhiring\b/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

let tokenCache = { token: '', at: 0, ttl: 0 };

async function getToken() {
  const { REDDIT_CLIENT_ID: id, REDDIT_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set');
  if (Date.now() - tokenCache.at < (tokenCache.ttl - 60) * 1000 && tokenCache.token) {
    return tokenCache.token;
  }
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`reddit token failed: ${res.status}`);
  const body = await res.json();
  tokenCache = { token: body.access_token, at: Date.now(), ttl: body.expires_in || 3600 };
  return tokenCache.token;
}

function toJob(post, subreddit) {
  const text = post.selftext || '';
  const email = (text.match(EMAIL_RE) || [])[0] || null; // only if the poster published it
  return normalize({
    id: `rd-${post.id}`,
    title: post.title.replace(/^\s*\[[^\]]+\]\s*/, ''),
    company: (post.link_flair_text || '').trim() || subreddit,
    location: null,
    remote: /remote/i.test(post.title + ' ' + text),
    type: /full[\s-]?time/i.test(post.title) ? 'Full-time'
      : /contract/i.test(post.title) ? 'Contract'
      : /freelance/i.test(post.title) ? 'Freelance' : null,
    currency: 'USD',
    salaryPeriod: 'mo',
    source: 'reddit',
    sourceUrl: `https://www.reddit.com${post.permalink}`,
    postedAt: new Date(post.created_utc * 1000).toISOString(),
    contact: { email, phone: null },
    description: text.slice(0, 500),
  });
}

async function fetchJobs() {
  const token = await getToken();
  const jobs = [];
  for (const sub of SUBREDDITS) {
    const res = await fetch(
      `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=25`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) continue; // one bad subreddit must not kill the feed
    const body = await res.json();
    for (const child of body?.data?.children || []) {
      const p = child.data;
      if (!p || p.stickied) continue;
      // r/forhire convention: employers tag posts [Hiring]. Other subs: match on text.
      const isHiring =
        HIRING_RE.test(p.title) ||
        HIRING_RE.test(p.link_flair_text || '') ||
        (sub !== 'forhire' && /\b(job|position|role|opening|apply)\b/i.test(p.title));
      if (isHiring) jobs.push(toJob(p, sub));
    }
  }
  return jobs
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 60);
}

module.exports = { fetchJobs };
