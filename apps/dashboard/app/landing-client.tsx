"use client";

import { motion, useAnimationControls } from "framer-motion";
import { Apple, ArrowRight, Chrome, Smartphone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";

type LandingClientProps = {
  pointsDistributed: number;
  activeDonors: number;
  redemptionsCount: number;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
};

const CHAOS_COLORS = ["#4ecdc4", "#f7dc6f", "#e74c3c", "#9b59b6", "#2ecc71"] as const;

const CHAOS_BLOBS = [
  { size: 180, left: "6%", top: "5%", color: "#4ecdc4", dx: -36, dy: 18, rotate: 120, scale: 0.8 },
  { size: 130, left: "18%", top: "28%", color: "#f7dc6f", dx: 30, dy: -24, rotate: -80, scale: 1.1 },
  { size: 220, left: "70%", top: "7%", color: "#e74c3c", dx: -22, dy: 20, rotate: 145, scale: 0.75 },
  { size: 95, left: "83%", top: "33%", color: "#9b59b6", dx: 16, dy: -16, rotate: -160, scale: 1.2 },
  { size: 150, left: "4%", top: "66%", color: "#2ecc71", dx: 24, dy: -12, rotate: 105, scale: 0.9 },
  { size: 110, left: "40%", top: "80%", color: "#f7dc6f", dx: -20, dy: -14, rotate: -100, scale: 1.15 },
  { size: 170, left: "76%", top: "68%", color: "#4ecdc4", dx: 28, dy: 22, rotate: 132, scale: 0.8 },
  { size: 120, left: "54%", top: "16%", color: "#2ecc71", dx: -18, dy: 26, rotate: -124, scale: 1.05 },
  { size: 200, left: "28%", top: "48%", color: "#9b59b6", dx: 22, dy: -24, rotate: 98, scale: 0.7 },
  { size: 160, left: "62%", top: "44%", color: "#e74c3c", dx: -30, dy: 14, rotate: -140, scale: 0.95 },
] as const;

const FLOATERS = [
  { size: 54, left: "11%", top: "14%", color: "#4ecdc4", round: true, drift: -22 },
  { size: 68, left: "29%", top: "89%", color: "#f7dc6f", round: false, drift: -30 },
  { size: 58, left: "44%", top: "11%", color: "#e74c3c", round: true, drift: -20 },
  { size: 66, left: "62%", top: "85%", color: "#9b59b6", round: false, drift: -26 },
  { size: 48, left: "86%", top: "17%", color: "#2ecc71", round: true, drift: -18 },
  { size: 64, left: "79%", top: "51%", color: "#f7dc6f", round: false, drift: -24 },
  { size: 56, left: "18%", top: "56%", color: "#2ecc71", round: true, drift: -28 },
  { size: 50, left: "84%", top: "76%", color: "#e74c3c", round: true, drift: -16 },
] as const;

type FloaterItem = (typeof FLOATERS)[number];

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function CtaButton({
  href,
  disabled,
  bg,
  text,
  rotate,
  children,
}: {
  href?: string;
  disabled?: boolean;
  bg: string;
  text: string;
  rotate: string;
  children: ReactNode;
}) {
  const className = `inline-flex items-center justify-center gap-2 border-8 border-black font-black text-xl px-8 py-5 h-auto transform ${rotate} shadow-[8px_8px_0_#000]`;

  if (!href || disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${className} ${bg} text-black opacity-55 cursor-not-allowed`}
        style={{ fontFamily: "Impact, sans-serif" }}
      >
        {children}
      </button>
    );
  }

  const external = href.startsWith("http://") || href.startsWith("https://");

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${className} ${bg} ${text}`}
        style={{ fontFamily: "Impact, sans-serif" }}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={`${className} ${bg} ${text}`} style={{ fontFamily: "Impact, sans-serif" }}>
      {children}
    </Link>
  );
}

function CursorFloater({
  item,
  i,
}: {
  item: FloaterItem;
  i: number;
}) {
  const controls = useAnimationControls();

  const triggerBounce = () =>
    controls.start({
      y: [0, 18, -22, 10, 0],
      rotate: item.round ? [0, 0, 0, 0, 0] : [0, 22, -16, 8, 0],
      transition: {
        duration: 0.62,
        times: [0, 0.2, 0.46, 0.72, 1],
        ease: "easeOut",
      },
    });

  return (
    <motion.div
      className="absolute"
      style={{
        left: item.left,
        top: item.top,
      }}
      animate={controls}
      whileHover={{
        scale: 1.14,
        y: -14,
        rotate: item.round ? 0 : 14,
        transition: { type: "spring", stiffness: 360, damping: 18, mass: 0.28 },
      }}
      whileTap={{ scale: 0.9 }}
      onHoverStart={() => {
        void triggerBounce();
      }}
      onTapStart={() => {
        void triggerBounce();
      }}
    >
      <motion.div
        className="border-4 border-black"
        style={{
          width: item.size,
          height: item.size,
          backgroundColor: item.color,
          borderRadius: item.round ? "50%" : "0",
        }}
        animate={{
          y: [0, item.drift, 0],
          rotate: [0, 360],
        }}
        transition={{
          duration: 6 + i,
          repeat: Number.POSITIVE_INFINITY,
          delay: i * 0.2,
        }}
      />
    </motion.div>
  );
}

export default function LandingClient({
  pointsDistributed,
  activeDonors,
  redemptionsCount,
  iosStoreUrl,
  androidStoreUrl,
}: LandingClientProps) {
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

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#ff6b35] text-black">
      <div className="absolute inset-0 opacity-20">
        {CHAOS_BLOBS.map((blob, i) => (
          <motion.div
            key={`${blob.left}-${blob.top}`}
            className="absolute rounded-full"
            style={{
              width: blob.size,
              height: blob.size,
              left: blob.left,
              top: blob.top,
              background: blob.color,
            }}
            animate={{
              x: [0, blob.dx],
              y: [0, blob.dy],
              rotate: [0, blob.rotate],
              scale: [1, blob.scale, 1],
            }}
            transition={{
              duration: 9 + i,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </div>

      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(0,0,0,0.5) 35px, rgba(0,0,0,0.5) 70px)",
        }}
      />

      <div className="relative z-10 px-6 py-12 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex flex-wrap items-start justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <h1 className="text-5xl font-black tracking-tighter text-black" style={{ fontFamily: "Impact, sans-serif" }}>
              SLUGSWAP
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {["DONATE", "REQUEST", "LIVE STATS"].map((text, i) => (
              <motion.div
                key={text}
                whileHover={{ scale: 1.1, rotate: -5 }}
                className={`border-4 border-[#4ecdc4] bg-black px-4 py-2 text-sm font-black text-[#f7dc6f] ${i % 2 === 0 ? "-rotate-2" : "rotate-2"}`}
                style={{ fontFamily: "Arial Black, sans-serif" }}
              >
                {text}
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="mx-auto mb-20 max-w-7xl">
          <div className="relative mb-14">
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <h2
                className="relative z-10 -rotate-3 font-black leading-none tracking-tighter text-black [font-size:clamp(4.25rem,17vw,16rem)]"
                style={{ fontFamily: "Impact, sans-serif", WebkitTextStroke: "4px #fff", paintOrder: "stroke fill" }}
              >
                SHARE
              </h2>
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                className="absolute right-3 top-3 z-0 h-20 w-20 rotate-45 border-8 border-black bg-[#f7dc6f] md:right-8 md:top-2 md:h-40 md:w-40"
              />
            </motion.div>

            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="relative -mt-4 ml-6 md:-mt-20 md:ml-20"
            >
              <h2
                className="rotate-2 font-black leading-none tracking-tighter text-[#4ecdc4] [font-size:clamp(4rem,16.2vw,15.8rem)]"
                style={{ fontFamily: "Impact, sans-serif", WebkitTextStroke: "4px #000", paintOrder: "stroke fill" }}
              >
                DINING
              </h2>
            </motion.div>

            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative -mt-4 md:-mt-20"
            >
              <h2
                className="-rotate-1 font-black leading-none tracking-tighter text-[#e74c3c] [font-size:clamp(3.95rem,15.8vw,15.5rem)]"
                style={{ fontFamily: "Impact, sans-serif", WebkitTextStroke: "4px #fff", paintOrder: "stroke fill" }}
              >
                POINTS
              </h2>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                className="absolute right-1 top-1/2 h-20 w-20 rounded-full border-8 border-black bg-[#9b59b6] md:right-16 md:h-32 md:w-32"
              />
            </motion.div>
          </div>

          <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            <motion.div
              whileHover={{ rotate: -2, scale: 1.05 }}
              className="relative rotate-1 overflow-hidden border-8 border-black bg-[#f7dc6f] p-8"
            >
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full border-4 border-black bg-[#e74c3c]" />
              <h3 className="mb-4 text-6xl font-black" style={{ fontFamily: "Impact, sans-serif" }}>
                {formatCurrency(pointsDistributed)}
              </h3>
              <p className="text-xl font-black" style={{ fontFamily: "Arial Black, sans-serif" }}>
                WORTH OF POINTS DISTRIBUTED
              </p>
              <div className="absolute -bottom-2 -left-2 h-16 w-16 rotate-45 bg-black" />
            </motion.div>

            <motion.div
              whileHover={{ rotate: 2, scale: 1.05 }}
              className="relative -rotate-2 border-8 border-black bg-[#4ecdc4] p-8"
            >
              <div className="absolute right-0 top-0 h-0 w-0 border-l-[100px] border-l-transparent border-t-[100px] border-t-[#9b59b6]" />
              <h3 className="relative z-10 mb-4 text-6xl font-black" style={{ fontFamily: "Impact, sans-serif" }}>
                {formatCount(activeDonors)}
              </h3>
              <p className="relative z-10 text-xl font-black" style={{ fontFamily: "Arial Black, sans-serif" }}>
                ACTIVE DONORS
              </p>
            </motion.div>

            <motion.div
              whileHover={{ rotate: -3, scale: 1.05 }}
              className="relative rotate-3 border-8 border-black bg-[#2ecc71] p-8"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                className="absolute -left-8 -top-8 h-24 w-24 border-4 border-black bg-[#f7dc6f]"
              />
              <h3 className="mb-4 text-6xl font-black" style={{ fontFamily: "Impact, sans-serif" }}>
                {formatCount(redemptionsCount)}
              </h3>
              <p className="text-base font-black md:text-xl" style={{ fontFamily: "Arial Black, sans-serif" }}>
                TOTAL CLAIMS
              </p>
            </motion.div>
          </div>

          <div className="relative mb-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative z-20 -rotate-1 border-8 border-[#f7dc6f] bg-black p-8 text-white"
            >
              <p className="text-3xl font-black leading-tight md:text-5xl" style={{ fontFamily: "Impact, sans-serif" }}>
                FAST. FAIR. SIMPLE.
              </p>
            </motion.div>
            <div className="absolute left-4 top-4 z-10 h-full w-full rotate-2 border-8 border-black bg-[#e74c3c]" />
            <div className="absolute left-8 top-8 z-0 h-full w-full -rotate-3 border-8 border-black bg-[#4ecdc4]" />
          </div>

          <div className="flex flex-wrap gap-6">
            <motion.div whileHover={{ scale: 1.1, rotate: -5 }} whileTap={{ scale: 0.95 }}>
              <CtaButton href={iosStoreUrl ?? undefined} disabled={!iosStoreUrl} bg="bg-[#e74c3c]" text="text-black" rotate="rotate-2">
                <Apple className="h-6 w-6" />
                {iosStoreUrl ? "IOS BETA" : "IOS SOON"}
                <ArrowRight className="ml-1 h-6 w-6" />
              </CtaButton>
            </motion.div>

            <motion.div whileHover={{ scale: 1.1, rotate: 5 }} whileTap={{ scale: 0.95 }}>
              <CtaButton href="/app" bg="bg-[#f7dc6f]" text="text-black" rotate="-rotate-1">
                <Chrome className="h-6 w-6" />
                OPEN WEB APP
              </CtaButton>
            </motion.div>

            <motion.div whileHover={{ scale: 1.1, rotate: -4 }} whileTap={{ scale: 0.95 }}>
              <CtaButton
                href={androidStoreUrl ?? undefined}
                disabled={!androidStoreUrl}
                bg="bg-[#9b59b6]"
                text="text-black"
                rotate="rotate-1"
              >
                <Smartphone className="h-6 w-6" />
                {androidStoreUrl ? "ANDROID APP" : "ANDROID SOON"}
              </CtaButton>
            </motion.div>
          </div>
        </div>

        <div className="mx-auto mb-20 max-w-7xl">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            {[
              {
                title: "POOLED SUPPORT",
                desc: "Your monthly donation splits into weekly pools. Everyone draws from the community fund.",
                color: "#4ecdc4",
                rotate: 2,
              },
              {
                title: "FAIR ALLOWANCES",
                desc: "Equal access to weekly allowance. Reset every week. First-come basis. No judgment.",
                color: "#f7dc6f",
                rotate: -3,
              },
              {
                title: "INSTANT CODES",
                desc: "Generate secure code via GET Tools. Redeem at any dining location. Expires in minutes.",
                color: "#e74c3c",
                rotate: 1,
              },
              {
                title: "PRIVACY FIRST",
                desc: "Donors do not see requesters. Anonymous giving and receiving with dignity.",
                color: "#2ecc71",
                rotate: -2,
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.05, rotate: 0 }}
                className="relative"
              >
                <div
                  className="relative z-10 border-8 border-black bg-white p-8"
                  style={{ transform: `rotate(${feature.rotate}deg)` }}
                >
                  <div className="mb-6 h-20 w-20 rotate-45 border-8 border-black" style={{ backgroundColor: feature.color }} />
                  <h3 className="mb-4 text-4xl font-black" style={{ fontFamily: "Impact, sans-serif" }}>
                    {feature.title}
                  </h3>
                  <p className="text-xl font-bold leading-relaxed" style={{ fontFamily: "Arial Black, sans-serif" }}>
                    {feature.desc}
                  </p>
                </div>
                <div
                  className="absolute left-4 top-4 z-0 h-full w-full border-8 border-black"
                  style={{ backgroundColor: feature.color }}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Placeholder testimonials disabled for now. */}

        <div className="mx-auto mb-20 mt-20 max-w-5xl text-center">
          <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} className="relative">
            <div className="relative z-20 border-8 border-[#f7dc6f] bg-black p-16 text-white">
              <h2 className="mb-8 text-5xl font-black md:text-8xl" style={{ fontFamily: "Impact, sans-serif" }}>
                OPEN THE
                <br />
                WEB APP
              </h2>
              <p className="mb-12 text-xl font-bold md:text-2xl" style={{ fontFamily: "Arial Black, sans-serif" }}>
                EVERY STUDENT DESERVES MEALS
              </p>
              <motion.div whileHover={{ scale: 1.15, rotate: 5 }}>
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center border-8 border-black bg-[#e74c3c] px-16 py-10 text-3xl font-black text-black shadow-[12px_12px_0_#f7dc6f]"
                  style={{ fontFamily: "Impact, sans-serif" }}
                >
                  OPEN APP NOW!!!
                </Link>
              </motion.div>
              <Link
                href="/admin/login"
                className="mt-6 inline-flex items-center justify-center border-4 border-white px-6 py-3 text-sm font-black tracking-[0.1em] text-white"
                style={{ fontFamily: "Arial Black, sans-serif" }}
              >
                ADMIN LOGIN
              </Link>
            </div>
            <div className="absolute left-8 top-8 z-10 h-full w-full rotate-3 border-8 border-black bg-[#4ecdc4]" />
            <div className="absolute left-16 top-16 z-0 h-full w-full -rotate-2 border-8 border-black bg-[#f7dc6f]" />
          </motion.div>
        </div>
      </div>

      {FLOATERS.map((item, i) => (
        <CursorFloater key={`${item.left}-${item.top}`} item={item} i={i} />
      ))}

      <div className="pointer-events-none absolute bottom-4 right-4 border-4 border-black bg-[#f7dc6f] px-4 py-2 text-xs font-black tracking-[0.1em] text-black md:text-sm" style={{ fontFamily: "Arial Black, sans-serif" }}>
        LIVE METRICS: {formatCurrency(pointsDistributed)} DISTRIBUTED | {formatCount(activeDonors)} DONORS |{" "}
        {formatCount(redemptionsCount)} REDEMPTIONS
      </div>

      <div className="sr-only">{CHAOS_COLORS.join(",")}</div>
    </div>
  );
}
