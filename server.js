require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jobsRouter = require('./routes/jobs');
const { startLoop } = require('./collector');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) =>
  res.json({ ok: true, service: 'jobbigo-backend', time: new Date().toISOString() })
);
app.use('/api/jobs', jobsRouter);

// POST /api/alerts — stub: save a job alert (email + filters) to your DB.
app.post('/api/alerts', (req, res) => {
  const { email, keywords, sources } = req.body || {};
  if (!email || !keywords) return res.status(400).json({ error: 'email and keywords required' });
  // TODO: persist to DB and hook into notifier.
  res.status(201).json({ ok: true, email, keywords, sources: sources || [] });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`JOBBIGO API on http://localhost:${PORT}`);
  if (process.env.COLLECTOR_ENABLED !== 'false') startLoop();
});
