"use client";

import {
  ArrowRight,
  Building2,
  Check,
  MapPinned,
  Menu,
  ShieldCheck,
  Utensils,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import brandLockup from "../../mobile/assets/src/brand/slug-swap-lockup.svg";
import mobileHomeScreenshot from "../../mobile/store-assets/app-store/source/01-home.png";

type LandingClientProps = {
  pointsDistributed: number;
  availablePointsThisWeek: number;
  activeDonors: number;
  totalUsers: number;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
};

const campusTools = [
  {
    title: "Dining",
    description: "Menus, hours, and what’s open now.",
    href: "/app",
    icon: Utensils,
    tone: "forest",
  },
  {
    title: "Study rooms",
    description: "Find open library rooms by time.",
    href: "/app",
    icon: Building2,
    tone: "gold",
  },
  {
    title: "Campus map",
    description: "Find buildings and hand off directions.",
    href: "/app",
    icon: MapPinned,
    tone: "coral",
  },
  {
    title: "My GET",
    description: "Keep balances and your barcode close.",
    href: "/app",
    icon: WalletCards,
    tone: "sage",
  },
] as const;

const sharingSteps = [
  {
    number: "01",
    title: "Choose an amount",
    description: "Donors set a weekly limit and always stay in control.",
  },
  {
    number: "02",
    title: "A student requests a meal",
    description: "SlugSwap quietly matches the request with available points.",
  },
  {
    number: "03",
    title: "They scan at checkout",
    description: "A short-lived claim code makes the handoff fast and private.",
  },
] as const;

function formatCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPoints(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function CampusScene() {
  return (
    <svg
      aria-hidden="true"
      className="landing-campus-scene"
      viewBox="0 0 760 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M86 555c83-76 196-81 240-166 43-83-38-127 14-213 43-71 143-69 185-146"
        stroke="#E8DECC"
        strokeWidth="48"
        strokeLinecap="round"
      />
      <g transform="translate(305 58)">
        <path d="M0 77 80 18l80 59H0Z" fill="#183D32" />
        <rect x="18" y="76" width="124" height="92" rx="4" fill="#183D32" />
        <rect x="38" y="94" width="17" height="56" rx="2" fill="#FFFDF7" />
        <rect x="72" y="94" width="17" height="56" rx="2" fill="#FFFDF7" />
        <rect x="106" y="94" width="17" height="56" rx="2" fill="#FFFDF7" />
        <circle cx="80" cy="58" r="8" fill="#F4C332" />
        <path d="M-18 168h196" stroke="#183D32" strokeWidth="14" strokeLinecap="round" />
      </g>
      <g transform="translate(84 285)">
        <path d="M56 0C25 0 0 25 0 56c0 46 56 99 56 99s56-53 56-99C112 25 87 0 56 0Z" fill="#183D32" />
        <circle cx="56" cy="52" r="19" fill="#F4C332" />
        <path d="M-34 161c50-27 133-27 181 0" stroke="#7A9A83" strokeWidth="24" strokeLinecap="round" />
      </g>
      <g transform="translate(570 225)">
        <path d="M46 0C21 0 0 21 0 46c0 38 46 81 46 81s46-43 46-81C92 21 71 0 46 0Z" fill="#183D32" />
        <circle cx="46" cy="43" r="15" fill="#F4C332" />
        <path d="M-34 134c42-23 120-23 160 0" stroke="#7A9A83" strokeWidth="23" strokeLinecap="round" />
      </g>
      <g fill="#7A9A83">
        <circle cx="78" cy="250" r="30" />
        <circle cx="112" cy="257" r="41" />
        <circle cx="153" cy="250" r="28" />
        <circle cx="616" cy="162" r="29" />
        <circle cx="651" cy="172" r="42" />
        <circle cx="695" cy="162" r="31" />
      </g>
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 384 512" role="img">
      <path
        fill="currentColor"
        d="M279.55 258.94c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-85.2-44.6-35.7-2.8-74.7 20.8-89 20.8-15.1 0-49.7-19.8-73-19-38.8.6-74.3 22.6-94.3 57.2-40.1 69.5-10.2 171.7 28.8 228.2 19.5 28.2 42.9 59.8 73.5 58.6 29.4-1.2 40.5-18.9 75.9-18.9s45.4 18.9 76.5 18.3c31.5-.6 51.5-28.7 70.8-57 22.5-32.8 31.8-64.6 32.3-66.2-.7-.3-61.9-23.8-62-94.3Zm-59.2-167.4c16.2-19.4 27.1-46.5 24.2-73.5-23.3.9-51.5 15.5-67.9 34.9-14.8 17.1-27.8 44.7-24.3 71.2 26 2 51.8-13.2 68-32.6Z"
      />
    </svg>
  );
}

function AppStoreButton({ href, compact = false }: { href: string | null; compact?: boolean }) {
  const content = (
    <>
      <AppleLogo />
      <span>
        <small>{href ? "Download on the" : "Coming soon to the"}</small>
        App Store
      </span>
    </>
  );

  if (!href) {
    return (
      <span className={`landing-app-store-button is-disabled${compact ? " is-compact" : ""}`} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <a className={`landing-app-store-button${compact ? " is-compact" : ""}`} href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  );
}

export default function LandingClient({
  pointsDistributed,
  availablePointsThisWeek,
  activeDonors,
  totalUsers,
  iosStoreUrl,
  androidStoreUrl,
}: LandingClientProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const { pathname, search, hash } = window.location;
    const searchParams = new URLSearchParams(search);
    const oauthTarget = window.localStorage.getItem("slugswap_oauth_target");
    const hasOAuthPayload =
      hash.includes("access_token=") ||
      hash.includes("refresh_token=") ||
      searchParams.has("code") ||
      searchParams.has("error");

    if (pathname === "/" && hasOAuthPayload) {
      if (oauthTarget === "admin") {
        window.localStorage.removeItem("slugswap_oauth_target");
        window.location.replace(`/admin/login${search}${hash}`);
        return;
      }
      window.location.replace(`/app/auth/callback${search}${hash}`);
    }
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  return (
    <div className="landing-root">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="SlugSwap home">
          <Image src={brandLockup} alt="SlugSwap" priority />
        </Link>

        <nav className="landing-nav" aria-label="Primary navigation">
          <a href="#tools">Campus tools</a>
          <a href="#how-it-works">How it works</a>
          <a href="#point-sharing">Point sharing</a>
          <a href="#about">About</a>
        </nav>

        <div className="landing-header-actions">
          <Link className="landing-web-link" href="/app">Open web app</Link>
          {iosStoreUrl ? (
            <a className="landing-header-cta" href={iosStoreUrl} target="_blank" rel="noreferrer">Get the app</a>
          ) : (
            <a className="landing-header-cta" href="#download">Get the app</a>
          )}
        </div>

        <button
          className="landing-menu-button"
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls="landing-mobile-nav"
          aria-label={isMenuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>

      <div id="landing-mobile-nav" className={`landing-mobile-nav${isMenuOpen ? " is-open" : ""}`}>
        <a href="#tools" onClick={() => setIsMenuOpen(false)}>Campus tools</a>
        <a href="#how-it-works" onClick={() => setIsMenuOpen(false)}>How it works</a>
        <a href="#point-sharing" onClick={() => setIsMenuOpen(false)}>Point sharing</a>
        <a href="#about" onClick={() => setIsMenuOpen(false)}>About</a>
        <Link href="/app" onClick={() => setIsMenuOpen(false)}>Open web app</Link>
      </div>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <h1 id="landing-title">Campus life,<br />less scattered.</h1>
            <p className="landing-hero-description">Dining, rooms, maps, GET, and point sharing—made easier for UCSC students.</p>
            <div className="landing-hero-actions">
              <AppStoreButton href={iosStoreUrl} />
              <Link className="landing-text-link" href="/app">Continue on the web <ArrowRight aria-hidden="true" /></Link>
            </div>
            <p className="landing-trust-line"><Check aria-hidden="true" /> Built for students at UC Santa Cruz</p>
          </div>

          <div className="landing-hero-visual" aria-label="SlugSwap mobile app preview">
            <CampusScene />
            <div className="landing-phone-shadow" aria-hidden="true" />
            <div className="landing-phone">
              <div className="landing-phone-speaker" aria-hidden="true" />
              <div className="landing-phone-screen">
                <Image
                  src={mobileHomeScreenshot}
                  alt="SlugSwap home screen with dining, rooms, map, My GET, and point sharing"
                  priority
                  sizes="(max-width: 780px) 72vw, 340px"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-tools" id="tools" aria-labelledby="tools-title">
          <div className="landing-section-heading is-centered">
            <h2 id="tools-title">What do you need today?</h2>
          </div>
          <div className="landing-tool-grid">
            {campusTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.title} className="landing-tool-card" href={tool.href}>
                  <span className={`landing-tool-icon is-${tool.tone}`}><Icon aria-hidden="true" /></span>
                  <span className="landing-tool-copy"><strong>{tool.title}</strong><span>{tool.description}</span></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="landing-intro" id="about">
          <div className="landing-intro-copy">
            <h2>The useful parts of campus, gathered together.</h2>
          </div>
          <p>
            SlugSwap started with dining points and grew into a calmer way to navigate everyday life at UCSC.
            Public tools work without an account; sign in when you want your GET card or point sharing.
          </p>
        </section>

        <section className="landing-feature-split" id="how-it-works" aria-label="Public and personal campus tools">
          <article className="landing-feature-panel is-public">
            <div>
              <h2>Plan your day without signing in.</h2>
              <ul>
                <li><Check aria-hidden="true" /> Browse dining menus and hours</li>
                <li><Check aria-hidden="true" /> Search campus buildings and directions</li>
                <li><Check aria-hidden="true" /> Find available study rooms</li>
              </ul>
              <Link className="landing-text-link" href="/app">Explore campus tools <ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
          <article className="landing-feature-panel is-personal">
            <div>
              <h2>Keep the things you reach for close.</h2>
              <ul>
                <li><Check aria-hidden="true" /> View your GET balances and barcode</li>
                <li><Check aria-hidden="true" /> Share unused dining points</li>
                <li><Check aria-hidden="true" /> Request a meal privately</li>
              </ul>
              <Link className="landing-text-link" href="/app">Sign in with UCSC <ArrowRight aria-hidden="true" /></Link>
            </div>
          </article>
        </section>

        <section className="landing-stats" aria-label="SlugSwap community statistics">
          <dl>
            <div><dt>{formatCurrency(pointsDistributed)}</dt><dd>points distributed</dd></div>
            <div><dt>{formatPoints(availablePointsThisWeek)}</dt><dd>available this week</dd></div>
            <div><dt>{formatCount(activeDonors)}</dt><dd>active donors</dd></div>
            <div><dt>{formatCount(totalUsers)}</dt><dd>students joined</dd></div>
          </dl>
        </section>

        <section className="landing-sharing" id="point-sharing" aria-labelledby="sharing-title">
          <div className="landing-sharing-heading">
            <div>
              <h2 id="sharing-title">Share points.<br /><em>Keep your privacy.</em></h2>
            </div>
            <p>Give what you can, request when you need it. SlugSwap handles the match without exposing who helped whom.</p>
          </div>
          <ol className="landing-steps">
            {sharingSteps.map((step) => (
              <li key={step.number}><span>{step.number}</span><h3>{step.title}</h3><p>{step.description}</p></li>
            ))}
          </ol>
          <div className="landing-privacy-note"><ShieldCheck aria-hidden="true" /><p><strong>Private by design.</strong> Donors never see who receives their points.</p></div>
        </section>

        <section className="landing-download" id="download">
          <div className="landing-download-art" aria-hidden="true"><CampusScene /></div>
          <div className="landing-download-copy">
            <h2>Ready when you need it.</h2>
            <p>Use SlugSwap on iPhone or keep going in your browser.</p>
            <div className="landing-download-actions">
              <AppStoreButton href={iosStoreUrl} compact />
              <Link className="landing-light-button" href="/app">Open web app <ArrowRight aria-hidden="true" /></Link>
            </div>
            {!androidStoreUrl ? null : <a className="landing-android-link" href={androidStoreUrl} target="_blank" rel="noreferrer">Android app</a>}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="landing-brand" href="/" aria-label="SlugSwap home"><Image src={brandLockup} alt="SlugSwap" /></Link>
        <p>Campus life, less scattered.</p>
        <nav aria-label="Footer navigation">
          <Link href="/privacy">Privacy</Link>
          <a href="https://github.com/darthnithin/slugswap/issues/new" target="_blank" rel="noreferrer">Support</a>
          <Link href="/admin/login">Admin</Link>
        </nav>
      </footer>
    </div>
  );
}
