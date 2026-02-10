# Release 1 (Private Alpha) - Status

## ✅ Completed

### Database
- ✅ All tables created in Neon (users, donations, weekly_pools, claim_codes, redemptions, user_allowances)
- ✅ Schema verified and aligned with code
- ✅ Drizzle ORM configured and working

### Backend APIs (Vercel Functions)
- ✅ `POST /api/donations/set` - Save/update donor monthly contribution
- ✅ `GET /api/donations/impact` - Fetch donor stats (people helped, points contributed)
- ✅ `PATCH /api/donations/pause` - Pause/resume sharing
- ✅ `GET /api/requesters/allowance` - Fetch weekly allowance + remaining amount
- ✅ `POST /api/claims/generate` - Generate claim code (currently mocked)
- ✅ `GET /api/claims/history` - Fetch claim history

### Frontend (React Native/Expo)
- ✅ Donor screen connected to backend APIs
  - Set monthly contribution
  - View impact stats
  - Pause/resume sharing
- ✅ Requester screen connected to backend APIs
  - View weekly allowance
  - Generate claim codes with countdown
  - View claim history
- ✅ Loading states and error handling
- ✅ Real-time countdown for active claim codes

## 🚧 To Complete for Release 1

### 1. GET Tools API Integration (High Priority)
**Current state:** Mock implementation generates random codes
**Needed:** Real integration with school's GET Tools API

**File to update:** `/api/claims/generate.ts`

Replace the `callGetToolsAPI` function with actual API calls:
```typescript
async function callGetToolsAPI(amount: number): Promise<{ code: string; expiresAt: Date }> {
  const response = await fetch(process.env.GET_TOOLS_API_URL!, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GET_TOOLS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    throw new Error('GET Tools API unavailable');
  }

  const data = await response.json();
  return {
    code: data.code,
    expiresAt: new Date(data.expiresAt),
  };
}
```

**Environment variables needed:**
- `GET_TOOLS_API_URL` - API endpoint
- `GET_TOOLS_API_KEY` - Authentication key

### 2. Weekly Pool Calculation Logic (Medium Priority)
**Current state:** Pools are created on-demand with default values
**Needed:** Background job to calculate weekly pools from active donations

**Options:**
- Vercel Cron Job (recommended for simplicity)
- Manual calculation endpoint for testing

**Steps:**
1. Create `/api/cron/calculate-weekly-pool.ts`
2. Query all active donations
3. Divide monthly amounts by 4 to get weekly contribution
4. Sum weekly contributions to create pool
5. Calculate per-user allowances based on pool size

### 3. Testing & Edge Cases (Medium Priority)
- Test full donor → pool → requester flow
- Handle expired codes (background job or on-access)
- Handle GET Tools API failures gracefully
- Test weekly reset logic

### 4. Vercel Deployment (Low Priority)
**Setup needed:**
- Deploy API functions to Vercel
- Configure environment variables
- Update `EXPO_PUBLIC_API_URL` to point to deployed URL

## Testing Locally

### 1. Start Vercel Dev Server (for API routes)
```bash
npm install -g vercel
vercel dev
```

### 2. Start Expo (for mobile app)
```bash
npm start
```

### 3. Update .env
Make sure your `.env` has:
```
DATABASE_URL=your-neon-url
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Next Steps (Priority Order)

1. **Test locally** - Verify donor and requester flows work end-to-end
2. **GET Tools API** - Get credentials and integrate real API
3. **Weekly pool logic** - Implement calculation from donations
4. **Deploy to Vercel** - Make APIs accessible to mobile app

## Notes

- Default weekly allowance is currently hardcoded to 50 points per user
- Default claim amount is 10 points per code
- These should be made configurable or calculated based on pool health
- Future plan: add low-points notifications before a requester's weekly allowance is nearly exhausted
- Code expiry is set to 5 minutes (configurable in `/api/claims/generate.ts`)
