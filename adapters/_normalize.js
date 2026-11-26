// Shared job normalizer: every adapter returns jobs in this shape.
function normalize(raw) {
  return {
    id: raw.id,
    title: raw.title,
    company: raw.company,
    location: raw.location || null,
    remote: Boolean(raw.remote),
    type: raw.type || null, // 'Full-time' | 'Contract' | 'Freelance' | 'Part-time'
    salaryMin: raw.salaryMin ?? null,
    salaryMax: raw.salaryMax ?? null,
    currency: raw.currency || 'USD',
    salaryPeriod: raw.salaryPeriod || 'mo',
    source: raw.source, // 'instagram' | 'linkedin' | 'x' | ...
    sourceUrl: raw.sourceUrl || null,
    postedAt: raw.postedAt, // ISO string
    contact: {
      // Only populate with contact info the poster published publicly.
      email: raw.contact?.email || null,
      phone: raw.contact?.phone || null,
    },
    description: raw.description || '',
  };
}

module.exports = { normalize };
