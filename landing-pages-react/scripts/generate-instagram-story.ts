import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WIDTH = 1080;
const HEIGHT = 1920;
const SAFE_ZONE = {
  top: 220,
  right: 72,
  bottom: 260,
  left: 72,
};
const SAFE_WIDTH = WIDTH - SAFE_ZONE.left - SAFE_ZONE.right;

type StoryVariant = "option-a" | "option-b";
type SlideIndex = 1 | 2 | 3;
type MessagingMode = "end_of_quarter_donor_drive";

interface StoryStats {
  activeDonors: number;
  claimsThisWeek: number;
  redemptionRate: string;
  totalUsers: number;
  getAccountsLinked: number;
  allTimeClaims: number;
  pointsDistributed: number;
  avgDonationPerWeek: number;
  avgPointsPerRequester: number;
}

export interface StoryCampaignConfig {
  variant: StoryVariant;
  slideIndex: SlideIndex;
  stats: StoryStats;
  ctaUrl: string;
  messagingMode: MessagingMode;
}

interface Theme {
  name: string;
  bgStart: string;
  bgEnd: string;
  bgSpot: string;
  paper: string;
  ink: string;
  muted: string;
  stroke: string;
  primary: string;
  secondary: string;
  tertiary: string;
  quaternary: string;
  highlight: string;
  stripe: string;
}

const THEMES: Record<StoryVariant, Theme> = {
  "option-a": {
    name: "brand-chaos-editorial",
    bgStart: "#0f1324",
    bgEnd: "#191327",
    bgSpot: "#2a1d3e",
    paper: "#f5f4ef",
    ink: "#0b0d16",
    muted: "#d4c59f",
    stroke: "#0a0b0f",
    primary: "#c99a3a",
    secondary: "#49d3c7",
    tertiary: "#ff6a3d",
    quaternary: "#cb4f3f",
    highlight: "#d8ff38",
    stripe: "rgba(255,255,255,0.055)",
  },
  "option-b": {
    name: "neon-chaos-editorial",
    bgStart: "#090f21",
    bgEnd: "#1a1031",
    bgSpot: "#2a0d39",
    paper: "#f6f6f2",
    ink: "#080a11",
    muted: "#e9d3ff",
    stroke: "#05060b",
    primary: "#d7ff32",
    secondary: "#08cfff",
    tertiary: "#ff8a00",
    quaternary: "#ff3f7d",
    highlight: "#8b00ff",
    stripe: "rgba(255,255,255,0.06)",
  },
};

const STATS: StoryStats = {
  activeDonors: 1,
  claimsThisWeek: 12,
  redemptionRate: "100%",
  totalUsers: 21,
  getAccountsLinked: 9,
  allTimeClaims: 28,
  pointsDistributed: 497.8,
  avgDonationPerWeek: 30,
  avgPointsPerRequester: 19.3,
};

const CTA_URL = "slugswap.vercel.app";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(
  SCRIPT_DIR,
  "../public/instagram-stories/end-of-quarter-mar-2026",
);
const SHOW_SAFE_GUIDES = false;
const DISPLAY_FONT =
  "'Bebas Neue', 'Anton', 'Archivo Black', 'League Spartan', 'Impact', sans-serif";
const SANS_FONT =
  "'Sora', 'Avenir Next', 'Montserrat', 'Helvetica Neue', sans-serif";
const MONO_FONT =
  "'IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function edgeChaos(seed: number, theme: Theme): string {
  const rand = seededRandom(seed);
  const colors = [theme.primary, theme.secondary, theme.tertiary, theme.quaternary, theme.highlight];
  const fragments: string[] = [];

  for (let i = 0; i < 28; i += 1) {
    const edge = Math.floor(rand() * 4);
    const isCircle = rand() > 0.55;
    const w = 44 + rand() * 170;
    const h = 36 + rand() * 150;
    const margin = 120;
    let x = 0;
    let y = 0;

    if (edge === 0) {
      x = rand() * WIDTH;
      y = rand() * margin;
    } else if (edge === 1) {
      x = rand() * WIDTH;
      y = HEIGHT - rand() * margin;
    } else if (edge === 2) {
      x = rand() * margin;
      y = rand() * HEIGHT;
    } else {
      x = WIDTH - rand() * margin;
      y = rand() * HEIGHT;
    }

    const rotate = -45 + rand() * 90;
    const color = colors[Math.floor(rand() * colors.length)];
    const opacity = 0.2 + rand() * 0.35;

    if (isCircle) {
      fragments.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(w / 2).toFixed(1)}" fill="${color}" fill-opacity="${opacity.toFixed(2)}" stroke="${theme.stroke}" stroke-width="4" />`,
      );
      continue;
    }

    fragments.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="${opacity.toFixed(2)}" stroke="${theme.stroke}" stroke-width="4" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" />`,
    );
  }

  return fragments.join("\n");
}

function sharedDefs(theme: Theme): string {
  return `
    <defs>
      <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.bgStart}" />
        <stop offset="100%" stop-color="${theme.bgEnd}" />
      </linearGradient>
      <radialGradient id="spot-a" cx="18%" cy="10%" r="65%">
        <stop offset="0%" stop-color="${theme.bgSpot}" stop-opacity="0.6" />
        <stop offset="100%" stop-color="${theme.bgSpot}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="spot-b" cx="84%" cy="92%" r="58%">
        <stop offset="0%" stop-color="${theme.bgSpot}" stop-opacity="0.46" />
        <stop offset="100%" stop-color="${theme.bgSpot}" stop-opacity="0" />
      </radialGradient>
      <pattern id="diagonal-stripes" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <rect width="48" height="48" fill="transparent" />
        <rect width="24" height="48" fill="${theme.stripe}" />
      </pattern>
      <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="42" result="noise"/>
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.08" />
        </feComponentTransfer>
      </filter>
      <filter id="hard-shadow" x="-30%" y="-30%" width="200%" height="200%">
        <feDropShadow dx="0" dy="10" stdDeviation="0" flood-color="${theme.stroke}" flood-opacity="0.55" />
      </filter>
    </defs>
  `;
}

function safeZoneGuides(theme: Theme): string {
  if (!SHOW_SAFE_GUIDES) return "";
  return `
    <rect x="${SAFE_ZONE.left}" y="${SAFE_ZONE.top}" width="${WIDTH - SAFE_ZONE.left - SAFE_ZONE.right}" height="${HEIGHT - SAFE_ZONE.top - SAFE_ZONE.bottom}" fill="none" stroke="${theme.muted}" stroke-opacity="0.08" stroke-width="2" stroke-dasharray="10 8" />
  `;
}

function card(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  theme: Theme,
  rotate = 0,
): string {
  return `
    <g transform="rotate(${rotate} ${x + width / 2} ${y + height / 2})" filter="url(#hard-shadow)">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" ry="18" fill="${fill}" stroke="${theme.stroke}" stroke-width="8" />
      <rect x="${x + 14}" y="${y + 14}" width="${width - 28}" height="${height - 28}" rx="8" ry="8" fill="none" stroke="${theme.paper}" stroke-opacity="0.78" stroke-width="3" />
    </g>
  `;
}

function heroLine(
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  theme: Theme,
  maxWidth = SAFE_WIDTH,
): string {
  const fitted = maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
  return `
    <text x="${x + 4}" y="${y + 8}" fill="${theme.stroke}" fill-opacity="0.82" font-size="${size}" font-family="${DISPLAY_FONT}" letter-spacing="1"${fitted}>${escapeXml(text)}</text>
    <text x="${x}" y="${y}" fill="${fill}" stroke="${theme.stroke}" stroke-width="2.6" paint-order="stroke fill" font-size="${size}" font-family="${DISPLAY_FONT}" letter-spacing="1"${fitted}>${escapeXml(text)}</text>
  `;
}

function baseLayer(theme: Theme, seed: number): string {
  return `
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg-gradient)" />
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#spot-a)" />
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#spot-b)" />
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#diagonal-stripes)" />
    ${edgeChaos(seed, theme)}
  `;
}

function slideOne(config: StoryCampaignConfig, theme: Theme): string {
  const miniWidth = (SAFE_WIDTH - 24 * 2) / 3;

  return `
    ${baseLayer(theme, 101)}
    ${heroLine("END-OF-QUARTER DONOR DRIVE", SAFE_ZONE.left, 280, 44, theme.highlight, theme)}
    ${heroLine("LOW ON DONORS.", SAFE_ZONE.left, 430, 92, theme.paper, theme, SAFE_WIDTH - 16)}
    ${heroLine("EXTRA POINTS", SAFE_ZONE.left, 540, 96, theme.secondary, theme, SAFE_WIDTH - 16)}
    ${heroLine("ARE COMING.", SAFE_ZONE.left, 650, 98, theme.tertiary, theme, SAFE_WIDTH - 16)}
    ${card(SAFE_ZONE.left, 790, SAFE_WIDTH, 220, theme.quaternary, theme, -2)}
    <text x="${SAFE_ZONE.left + 36}" y="856" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}" letter-spacing="0.9">IF YOU&apos;VE GOT EXTRA</text>
    <text x="${SAFE_ZONE.left + 36}" y="916" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}" letter-spacing="0.9">POINTS, THIS IS</text>
    <text x="${SAFE_ZONE.left + 36}" y="976" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}" letter-spacing="0.9">THE WEEK TO SHARE.</text>
    ${card(SAFE_ZONE.left, 1060, miniWidth, 156, theme.primary, theme, -1)}
    ${card(SAFE_ZONE.left + miniWidth + 24, 1060, miniWidth, 156, theme.secondary, theme, 1)}
    ${card(SAFE_ZONE.left + (miniWidth + 24) * 2, 1060, miniWidth, 156, theme.highlight, theme, -1)}
    <text x="${SAFE_ZONE.left + 22}" y="1116" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">ACTIVE DONORS</text>
    <text x="${SAFE_ZONE.left + 22}" y="1190" fill="${theme.ink}" font-size="86" font-family="${DISPLAY_FONT}">${config.stats.activeDonors}</text>
    <text x="${SAFE_ZONE.left + miniWidth + 46}" y="1116" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">CLAIMS / WEEK</text>
    <text x="${SAFE_ZONE.left + miniWidth + 46}" y="1190" fill="${theme.ink}" font-size="86" font-family="${DISPLAY_FONT}">${config.stats.claimsThisWeek}</text>
    <text x="${SAFE_ZONE.left + (miniWidth + 24) * 2 + 22}" y="1116" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">REDEEM RATE</text>
    <text x="${SAFE_ZONE.left + (miniWidth + 24) * 2 + 22}" y="1190" fill="${theme.ink}" font-size="76" font-family="${DISPLAY_FONT}">${escapeXml(config.stats.redemptionRate)}</text>
    ${card(SAFE_ZONE.left, 1262, 560, 120, theme.primary, theme, 1.4)}
    <text x="${SAFE_ZONE.left + 30}" y="1340" fill="${theme.ink}" font-size="72" font-family="${DISPLAY_FONT}" letter-spacing="1.3">JOIN SLUGSWAP</text>
    <text x="${SAFE_ZONE.left}" y="1442" fill="${theme.muted}" font-size="36" font-family="${MONO_FONT}" textLength="${SAFE_WIDTH}" lengthAdjust="spacingAndGlyphs">students helping students • no awkward asks</text>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#000" filter="url(#grain)" opacity="0.15" />
    ${safeZoneGuides(theme)}
  `;
}

function slideTwo(config: StoryCampaignConfig, theme: Theme): string {
  const stats = [
    { label: "ACTIVE DONORS", value: String(config.stats.activeDonors) },
    { label: "CLAIMS / WEEK", value: String(config.stats.claimsThisWeek) },
    { label: "REDEEM RATE", value: config.stats.redemptionRate },
    { label: "TOTAL USERS", value: String(config.stats.totalUsers) },
    { label: "GET LINKED", value: String(config.stats.getAccountsLinked) },
    { label: "ALL-TIME", value: String(config.stats.allTimeClaims) },
    { label: "POINTS DIST.", value: String(config.stats.pointsDistributed) },
    { label: "AVG DON / WK", value: String(config.stats.avgDonationPerWeek) },
    { label: "AVG PTS/REQ", value: String(config.stats.avgPointsPerRequester) },
  ];

  const gap = 20;
  const tileWidth = (WIDTH - SAFE_ZONE.left - SAFE_ZONE.right - gap * 2) / 3;
  const tileHeight = 178;
  const startY = 540;
  const tileColors = [theme.tertiary, theme.secondary, theme.highlight, theme.quaternary, theme.primary];

  const tiles = stats
    .map((stat, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = SAFE_ZONE.left + col * (tileWidth + gap);
      const y = startY + row * (tileHeight + gap);
      const color = tileColors[index % tileColors.length];
      const tilt = ((index % 2 === 0 ? -0.9 : 0.9) * ((index % 3) + 0.2)).toFixed(2);
      const valueSize = stat.value.length > 5 ? 62 : 78;

      return `
        <g transform="rotate(${tilt} ${x + tileWidth / 2} ${y + tileHeight / 2})" filter="url(#hard-shadow)">
          <rect x="${x}" y="${y}" rx="16" ry="16" width="${tileWidth}" height="${tileHeight}" fill="${color}" stroke="${theme.stroke}" stroke-width="8" />
          <text x="${x + 18}" y="${y + 52}" fill="${theme.ink}" font-size="24" font-family="${SANS_FONT}" font-weight="800" letter-spacing="0.8">${escapeXml(stat.label)}</text>
          <text x="${x + 20}" y="${y + 148}" fill="${theme.ink}" font-size="${valueSize}" font-family="${DISPLAY_FONT}">${escapeXml(stat.value)}</text>
        </g>
      `;
    })
    .join("\n");

  return `
    ${baseLayer(theme, 202)}
    ${heroLine("WEEK OF MAR 1 — MAR 8, 2026", SAFE_ZONE.left, 270, 44, theme.primary, theme)}
    ${heroLine("THE NEED IS REAL.", SAFE_ZONE.left, 382, 74, theme.paper, theme, SAFE_WIDTH - 14)}
    ${heroLine("THE IMPACT IS REAL.", SAFE_ZONE.left, 464, 74, theme.paper, theme, SAFE_WIDTH - 14)}
    ${tiles}
    ${card(SAFE_ZONE.left, 1144, SAFE_WIDTH, 220, theme.tertiary, theme, -1.4)}
    <text x="${SAFE_ZONE.left + 30}" y="1212" fill="${theme.ink}" font-size="50" font-family="${DISPLAY_FONT}" letter-spacing="0.8">STUDENTS ARE REDEEMING</text>
    <text x="${SAFE_ZONE.left + 30}" y="1272" fill="${theme.ink}" font-size="50" font-family="${DISPLAY_FONT}" letter-spacing="0.8">SUCCESSFULLY.</text>
    <text x="${SAFE_ZONE.left + 30}" y="1332" fill="${theme.ink}" font-size="50" font-family="${DISPLAY_FONT}" letter-spacing="0.8">WE NEED MORE DONORS.</text>
    <text x="${SAFE_ZONE.left}" y="1438" fill="${theme.muted}" font-size="36" font-family="${MONO_FONT}" textLength="${SAFE_WIDTH}" lengthAdjust="spacingAndGlyphs">users ${config.stats.totalUsers} • all-time claims ${config.stats.allTimeClaims}</text>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#000" filter="url(#grain)" opacity="0.16" />
    ${safeZoneGuides(theme)}
  `;
}

function slideThree(config: StoryCampaignConfig, theme: Theme): string {
  const ctaUrl = escapeXml(config.ctaUrl);
  const pillWidth = (SAFE_WIDTH - 40) / 3;
  return `
    ${baseLayer(theme, 303)}
    ${heroLine("END-OF-QUARTER PUSH • MARCH 2026", SAFE_ZONE.left, 276, 44, theme.primary, theme)}
    ${heroLine("DONATE NOW.", SAFE_ZONE.left, 410, 98, theme.paper, theme, SAFE_WIDTH - 8)}
    ${heroLine("NOW ON iOS +", SAFE_ZONE.left, 516, 92, theme.highlight, theme, SAFE_WIDTH - 8)}
    ${heroLine("ANDROID + WEB", SAFE_ZONE.left, 614, 90, theme.secondary, theme, SAFE_WIDTH - 8)}
    ${card(SAFE_ZONE.left, 760, SAFE_WIDTH, 218, theme.tertiary, theme, 1.6)}
    <text x="${SAFE_ZONE.left + 32}" y="838" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}" letter-spacing="0.8">GOT EXTRA POINTS BEFORE</text>
    <text x="${SAFE_ZONE.left + 32}" y="896" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}" letter-spacing="0.8">QUARTER ENDS?</text>
    <text x="${SAFE_ZONE.left + 32}" y="954" fill="${theme.ink}" font-size="56" font-family="${DISPLAY_FONT}" letter-spacing="0.8">PUT THEM TO WORK TODAY.</text>
    ${card(SAFE_ZONE.left, 1020, pillWidth, 104, theme.paper, theme, -1.2)}
    ${card(SAFE_ZONE.left + pillWidth + 20, 1020, pillWidth, 104, theme.paper, theme, 1.2)}
    ${card(SAFE_ZONE.left + (pillWidth + 20) * 2, 1020, pillWidth, 104, theme.paper, theme, -1.2)}
    <text x="${SAFE_ZONE.left + 86}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">iOS</text>
    <text x="${SAFE_ZONE.left + pillWidth + 74}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">ANDROID</text>
    <text x="${SAFE_ZONE.left + (pillWidth + 20) * 2 + 86}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">WEB</text>
    ${card(SAFE_ZONE.left, 1158, SAFE_WIDTH, 142, theme.primary, theme, -1)}
    <text x="${SAFE_ZONE.left + 28}" y="1248" fill="${theme.ink}" font-size="74" font-family="${DISPLAY_FONT}" textLength="${SAFE_WIDTH - 56}" lengthAdjust="spacingAndGlyphs">${ctaUrl}</text>
    ${card(SAFE_ZONE.left, 1328, 560, 116, theme.secondary, theme, 1.2)}
    <text x="${SAFE_ZONE.left + 26}" y="1403" fill="${theme.ink}" font-size="66" font-family="${DISPLAY_FONT}">JOIN + DONATE</text>
    <text x="${SAFE_ZONE.left}" y="1518" fill="${theme.muted}" font-size="35" font-family="${MONO_FONT}">new: iOS + Android + Web</text>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#000" filter="url(#grain)" opacity="0.16" />
    ${safeZoneGuides(theme)}
  `;
}

function buildSlide(config: StoryCampaignConfig, theme: Theme): string {
  const content =
    config.slideIndex === 1
      ? slideOne(config, theme)
      : config.slideIndex === 2
        ? slideTwo(config, theme)
        : slideThree(config, theme);

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${sharedDefs(theme)}
    ${content}
  </svg>`;
}

async function renderSlide(config: StoryCampaignConfig): Promise<void> {
  const theme = THEMES[config.variant];
  const svg = buildSlide(config, theme);
  const fileName = `story-slide-${config.slideIndex}-${config.variant}.png`;
  const outputPath = path.join(OUTPUT_DIR, fileName);
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(outputPath);
  console.log(`Generated ${fileName} (${theme.name})`);
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const configs: StoryCampaignConfig[] = (["option-a", "option-b"] as const).flatMap(
    (variant) =>
      ([1, 2, 3] as const).map((slideIndex) => ({
        variant,
        slideIndex,
        stats: STATS,
        ctaUrl: CTA_URL,
        messagingMode: "end_of_quarter_donor_drive",
      })),
  );

  await Promise.all(configs.map((config) => renderSlide(config)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
