import { headers } from "next/headers";
import { db } from "@/lib/server/db";
import * as schema from "@/lib/server/schema";
import { eq, lt } from "drizzle-orm";
import { getAdminConfig } from "@/lib/server/config";

type Props = { params: Promise<{ code: string }> };

export default async function ReferralRedirectPage({ params }: Props) {
  const { code } = await params;
  const headersList = await headers();

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const normalizedCode = code.toUpperCase();

  const [referrer] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.referralCode, normalizedCode))
    .limit(1);

  const valid = !!referrer;

  if (valid) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Promise.all([
      db.insert(schema.referralFingerprints).values({
        referralCode: normalizedCode,
        ipAddress: ip,
      }),
      db
        .delete(schema.referralFingerprints)
        .where(lt(schema.referralFingerprints.createdAt, oneDayAgo)),
    ]);
  }

  const { config } = await getAdminConfig();
  const storeUrl = config.iosStoreUrl;

  return (
    <>
      {/* React 19 hoists <style> tags to <head> automatically */}
      <style>{`
        .referral-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .referral-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(201,148,62,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 100% 100%, rgba(201,148,62,0.05) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }
        .referral-card {
          position: relative;
          z-index: 1;
          max-width: 400px;
          width: 100%;
          text-align: center;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .r-wordmark {
          font-family: var(--font-display), 'Instrument Serif', Georgia, serif;
          font-size: 2.4rem;
          font-weight: 400;
          color: #f0e8db;
          letter-spacing: -0.02em;
          line-height: 1;
          margin: 0 0 8px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
        }
        .r-wordmark em {
          color: #c9943e;
          font-style: italic;
        }
        .r-tagline {
          font-size: 0.72rem;
          color: #5c564e;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-weight: 500;
          margin: 0 0 48px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
        }
        .r-divider {
          width: 40px;
          height: 1px;
          background: #2a2621;
          margin: 0 auto 36px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
        }
        .r-invite-label {
          font-size: 0.63rem;
          color: #5c564e;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-weight: 600;
          margin: 0 0 12px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both;
        }
        .r-headline {
          font-family: var(--font-display), 'Instrument Serif', Georgia, serif;
          font-size: 2rem;
          font-weight: 400;
          color: #f0e8db;
          line-height: 1.25;
          margin: 0 0 12px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.22s both;
        }
        .r-headline.muted { color: #8a8278; }
        .r-subhead {
          font-size: 0.88rem;
          color: #8a8278;
          line-height: 1.65;
          margin: 0 0 36px;
          font-weight: 300;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.26s both;
        }
        .r-code-block {
          display: inline-block;
          background: #1a1714;
          border: 1px solid #2a2621;
          border-radius: 12px;
          padding: 14px 28px;
          margin: 0 0 36px;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
        }
        .r-code-label {
          font-size: 0.6rem;
          color: #5c564e;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-weight: 600;
          margin: 0 0 6px;
        }
        .r-code-value {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 1.8rem;
          font-weight: 500;
          color: #c9943e;
          letter-spacing: 0.12em;
          margin: 0;
        }
        .r-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #c9943e;
          color: #0d0b09;
          font-family: var(--font-body), 'Outfit', system-ui, sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          padding: 14px 28px;
          border-radius: 100px;
          text-decoration: none;
          transition: background 0.2s, transform 0.15s;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.34s both;
          margin-bottom: 16px;
        }
        .r-cta:hover { background: #e6b455; transform: translateY(-1px); }
        .r-note {
          font-size: 0.7rem;
          color: #3d3730;
          font-family: var(--font-mono), monospace;
          font-weight: 300;
          margin: 0;
          animation: r-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
        }
        @keyframes r-rise {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {valid && storeUrl && (
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){window.location.href=${JSON.stringify(storeUrl)};},1000);`,
          }}
        />
      )}

      <div className="referral-page">
        <div className="referral-card">
          <p className="r-wordmark">
            Slug<em>Swap</em>
          </p>
          <p className="r-tagline">Share dining points</p>
          <div className="r-divider" />

          {valid ? (
            <>
              <p className="r-invite-label">You&rsquo;ve been invited</p>
              <h1 className="r-headline">
                Free dining points<br />
                <em>are waiting for you.</em>
              </h1>
              <p className="r-subhead">
                Download SlugSwap and enter your referral code to earn bonus
                points when you sign up.
              </p>
              <div className="r-code-block">
                <p className="r-code-label">Your referral code</p>
                <p className="r-code-value">{normalizedCode}</p>
              </div>
              <br />
              {storeUrl ? (
                <>
                  <a href={storeUrl} className="r-cta">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    Download on the App Store
                  </a>
                  <p className="r-note">Redirecting automatically&hellip;</p>
                </>
              ) : (
                <p className="r-note">Search &ldquo;SlugSwap&rdquo; on the App Store</p>
              )}
            </>
          ) : (
            <>
              <h1 className="r-headline muted">Link not found</h1>
              <p className="r-subhead">
                This referral link is invalid or has expired.<br />
                Ask your friend to share a fresh link.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
