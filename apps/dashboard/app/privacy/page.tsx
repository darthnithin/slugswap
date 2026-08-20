import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | SlugSwap",
  description: "How SlugSwap handles personal information and account deletion.",
};

const sections = [
  {
    id: "information-we-collect",
    number: "01",
    title: "Information we collect",
    content: (
      <>
        <p>SlugSwap collects only the information needed to provide its student tools:</p>
        <ul>
          <li>
            <strong>Account information:</strong> your Google-provided name, email address,
            profile photo URL, and an internal user identifier.
          </li>
          <li>
            <strong>GET account information:</strong> an encrypted device credential, account
            names, balances, and barcode data when you choose to link UCSC GET.
          </li>
          <li>
            <strong>Point-sharing activity:</strong> donation preferences, claim codes,
            redemptions, allowances, and notification preferences.
          </li>
          <li>
            <strong>Device messaging data:</strong> an Expo push token and mobile platform when
            you enable notifications.
          </li>
        </ul>
        <p>
          Map searches and your current location stay on your device. SlugSwap does not store
          precise or coarse location data.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    number: "02",
    title: "How we use information",
    content: (
      <>
        <p>We use this information to:</p>
        <ul>
          <li>sign you in and maintain your SlugSwap profile;</li>
          <li>show GET balances and barcode tools you request;</li>
          <li>operate donations, weekly allowances, and short-lived claim codes;</li>
          <li>send point-sharing notifications you enable;</li>
          <li>protect the service, diagnose failures, and respond to support requests.</li>
        </ul>
        <p>
          We do not sell personal information, run third-party advertising, or use your data to
          track you across apps or websites.
        </p>
      </>
    ),
  },
  {
    id: "services",
    number: "03",
    title: "Services we rely on",
    content: (
      <p>
        SlugSwap uses Google for sign-in, Supabase for authentication, Neon for database
        hosting, Vercel for the web service, Expo for optional push notifications, and the
        CBORD GET service to provide features you explicitly request. These providers process
        information under their own terms and privacy policies. We share only what is needed
        to operate the relevant feature.
      </p>
    ),
  },
  {
    id: "retention",
    number: "04",
    title: "Retention and security",
    content: (
      <>
        <p>
          We retain account information while your SlugSwap account is active. GET credentials
          are encrypted at rest. Access is limited to the service components that need the data
          to fulfill your requests.
        </p>
        <p>
          When you delete your account, we delete your profile, stored GET credential, donation
          settings, requests, push tokens, and other directly linked records. Transaction records
          involving another student may remain only after the link to you and any balance snapshot
          have been removed. Hosting providers may retain limited security and operational logs on
          their standard schedules.
        </p>
      </>
    ),
  },
  {
    id: "your-choices",
    number: "05",
    title: "Your choices",
    content: (
      <>
        <p>You can unlink GET, disable notifications, or sign out at any time.</p>
        <p>
          To permanently delete your account, open <strong>More → Account → Delete account</strong>
          in the SlugSwap app. This deletes your SlugSwap account; it does not delete your Google
          or UCSC GET account.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    number: "06",
    title: "Questions and changes",
    content: (
      <>
        <p>
          SlugSwap is an independent student-built project and is not an official UCSC or CBORD
          service. It is intended for university students and is not directed to children under 13.
        </p>
        <p>
          We may update this policy as the product changes. Material revisions will be reflected
          by the effective date below. For privacy questions or requests, open a support request
          through our contact link. Do not include GET credentials or claim codes.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-hero">
        <nav className="privacy-nav" aria-label="Privacy page navigation">
          <a className="privacy-wordmark" href="/" aria-label="SlugSwap home">
            Slug<span>Swap</span>
          </a>
          <a
            className="privacy-contact"
            href="https://github.com/darthnithin/slugswap/issues/new"
          >
            Contact support <span aria-hidden="true">↗</span>
          </a>
        </nav>

        <div className="privacy-hero-grid">
          <div>
            <h1>Student tools should not cost you your privacy.</h1>
          </div>
        </div>
      </header>

      <div className="privacy-layout">
        <aside className="privacy-toc" aria-label="On this page">
          <p>On this page</p>
          {sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              <span>{section.number}</span> {section.title}
            </a>
          ))}
        </aside>

        <article className="privacy-article">
          {sections.map((section) => (
            <section id={section.id} key={section.id} className="privacy-section">
              <div className="privacy-section-number">{section.number}</div>
              <div>
                <h2>{section.title}</h2>
                {section.content}
              </div>
            </section>
          ))}

          <footer className="privacy-footer">
            <p>Effective August 20, 2026</p>
            <a href="/">Back to SlugSwap</a>
          </footer>
        </article>
      </div>
    </main>
  );
}
