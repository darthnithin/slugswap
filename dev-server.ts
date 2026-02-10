import express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from public/ with no-cache for dev
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  },
}));

// Import and mount API routes
import donationsSet from './api/donations/set';
import donationsImpact from './api/donations/impact';
import donationsPause from './api/donations/pause';
import requestersAllowance from './api/requesters/allowance';
import claimsGenerate from './api/claims/generate';
import claimsRefresh from './api/claims/refresh';
import claimsHistory from './api/claims/history';
import getLoginUrl from './api/get/login-url';
import getLink from './api/get/link';
import getLinkStatus from './api/get/link-status';
import getAccounts from './api/get/accounts';
import adminStats from './api/admin/stats';
import adminConfig from './api/admin/config';

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
app.post('/api/claims/refresh', wrapHandler(claimsRefresh));
app.get('/api/claims/history', wrapHandler(claimsHistory));
app.get('/api/get/login-url', wrapHandler(getLoginUrl));
app.post('/api/get/link', wrapHandler(getLink));
app.delete('/api/get/link', wrapHandler(getLink));
app.get('/api/get/link-status', wrapHandler(getLinkStatus));
app.get('/api/get/accounts', wrapHandler(getAccounts));

// Admin API routes
app.get('/api/admin/stats', wrapHandler(adminStats));
app.get('/api/admin/config', wrapHandler(adminConfig));
app.post('/api/admin/config', wrapHandler(adminConfig));
app.patch('/api/admin/config', wrapHandler(adminConfig));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✓ Dev server running at http://localhost:${PORT}`);
  console.log(`✓ API routes available at http://localhost:${PORT}/api/`);
  console.log(`✓ Admin dashboard at http://localhost:${PORT}/admin.html`);
});
