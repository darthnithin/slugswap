import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Import and mount API routes
import donationsSet from './api/donations/set';
import donationsImpact from './api/donations/impact';
import donationsPause from './api/donations/pause';
import requestersAllowance from './api/requesters/allowance';
import claimsGenerate from './api/claims/generate';
import claimsHistory from './api/claims/history';

// Wrap Vercel handlers for Express
const wrapHandler = (handler: any) => async (req: express.Request, res: express.Response) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

app.post('/api/donations/set', wrapHandler(donationsSet));
app.get('/api/donations/impact', wrapHandler(donationsImpact));
app.patch('/api/donations/pause', wrapHandler(donationsPause));
app.get('/api/requesters/allowance', wrapHandler(requestersAllowance));
app.post('/api/claims/generate', wrapHandler(claimsGenerate));
app.get('/api/claims/history', wrapHandler(claimsHistory));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✓ Dev server running at http://localhost:${PORT}`);
  console.log(`✓ API routes available at http://localhost:${PORT}/api/`);
});
