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
  uniqueDonors: number;
  claimsThisWeek: number;
  claimsThisWeekAmount: number;
  redeemedClaimsThisWeek: number;
  redeemedAmountThisWeek: number;
  redemptionRate: string;
  totalUsers: number;
  getAccountsLinked: number;
  allTimeClaims: number;
  pointsDistributed: number;
  weeklyInflow: number;
  availablePointsThisWeek: number;
  daysLeftInQuarter: number;
}

interface StoryDataFile {
  generatedAt: string;
  liveLabel: string;
  weekStart: string;
  weekEnd: string;
  stats: StoryStats;
  display: {
    pointsDistributed: string;
    weeklyInflow: string;
    claimsThisWeekAmount: string;
    redeemedAmountThisWeek: string;
    availablePointsThisWeek: string;
  };
}

export interface StoryCampaignConfig {
  variant: StoryVariant;
  slideIndex: SlideIndex;
  storyData: StoryDataFile;
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

const CTA_URL = "slugswap.vercel.app";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(
  SCRIPT_DIR,
  "../public/instagram-stories/end-of-quarter-mar-2026",
);
const STORY_DATA_PATH = path.join(OUTPUT_DIR, "story-data.json");
const SHOW_SAFE_GUIDES = false;
const DISPLAY_FONT =
  "'Bebas Neue', 'Anton', 'Archivo Black', 'League Spartan', 'Impact', sans-serif";
const SANS_FONT =
  "'Sora', 'Avenir Next', 'Montserrat', 'Helvetica Neue', sans-serif";
const MONO_FONT =
  "'IBM Plex Mono', 'SFMono-Regular', 'Menlo', 'Consolas', monospace";

const FALLBACK_STORY_DATA: StoryDataFile = {
  generatedAt: "2026-03-16T16:34:07.377Z",
  liveLabel: "LIVE DATA MAR 16",
  weekStart: "2026-03-16T00:00:00.000Z",
  weekEnd: "2026-03-23T00:00:00.000Z",
  stats: {
    activeDonors: 8,
    uniqueDonors: 8,
    claimsThisWeek: 3,
    claimsThisWeekAmount: 33,
    redeemedClaimsThisWeek: 3,
    redeemedAmountThisWeek: 33,
    redemptionRate: "100%",
    totalUsers: 163,
    getAccountsLinked: 48,
    allTimeClaims: 76,
    pointsDistributed: 1413.5,
    weeklyInflow: 1900,
    availablePointsThisWeek: 1867.1,
    daysLeftInQuarter: 4,
  },
  display: {
    pointsDistributed: "1,413.5",
    weeklyInflow: "1,900",
    claimsThisWeekAmount: "33.0",
    redeemedAmountThisWeek: "33.0",
    availablePointsThisWeek: "1,867.1",
  },
};

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
  const { stats } = config.storyData;
  const miniWidth = (SAFE_WIDTH - 24 * 2) / 3;

  return `
    ${baseLayer(theme, 101)}
    ${heroLine(`${stats.daysLeftInQuarter} DAYS LEFT`, SAFE_ZONE.left, 280, 44, theme.highlight, theme)}
    ${card(636, 322, 248, 96, theme.quaternary, theme, -8)}
    <text x="664" y="388" fill="${theme.ink}" font-size="50" font-family="${DISPLAY_FONT}">FINAL DROP</text>
    ${heroLine("EVERYTHING", SAFE_ZONE.left, 430, 106, theme.paper, theme, SAFE_WIDTH - 16)}
    ${heroLine("MUST GO.", SAFE_ZONE.left, 545, 108, theme.secondary, theme, SAFE_WIDTH - 16)}
    ${heroLine("EXTRA POINTS TOO.", SAFE_ZONE.left, 656, 82, theme.tertiary, theme, SAFE_WIDTH - 16)}
    ${card(SAFE_ZONE.left, 760, 620, 100, theme.quaternary, theme, 3.2)}
    <text x="${SAFE_ZONE.left + 28}" y="826" fill="${theme.ink}" font-size="56" font-family="${DISPLAY_FONT}" letter-spacing="0.9">${stats.uniqueDonors} DONORS ALREADY IN</text>
    ${card(SAFE_ZONE.left, 854, SAFE_WIDTH, 256, theme.paper, theme, -3)}
    <text x="${SAFE_ZONE.left + 36}" y="858" fill="${theme.ink}" font-size="52" font-family="${DISPLAY_FONT}" letter-spacing="0.9">${stats.totalUsers} STUDENTS</text>
    <text x="${SAFE_ZONE.left + 36}" y="920" fill="${theme.ink}" font-size="52" font-family="${DISPLAY_FONT}" letter-spacing="0.9">ARE ON SLUGSWAP.</text>
    <text x="${SAFE_ZONE.left + 36}" y="982" fill="${theme.ink}" font-size="52" font-family="${DISPLAY_FONT}" letter-spacing="0.9">${stats.uniqueDonors} HAVE</text>
    <text x="${SAFE_ZONE.left + 36}" y="1044" fill="${theme.ink}" font-size="52" font-family="${DISPLAY_FONT}" letter-spacing="0.9">ALREADY DONATED.</text>
    ${card(SAFE_ZONE.left, 1140, miniWidth, 156, theme.primary, theme, -2.4)}
    ${card(SAFE_ZONE.left + miniWidth + 24, 1146, miniWidth, 156, theme.secondary, theme, 1.4)}
    ${card(SAFE_ZONE.left + (miniWidth + 24) * 2, 1138, miniWidth, 156, theme.highlight, theme, -1.1)}
    <text x="${SAFE_ZONE.left + 22}" y="1196" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">DAYS LEFT</text>
    <text x="${SAFE_ZONE.left + 22}" y="1270" fill="${theme.ink}" font-size="86" font-family="${DISPLAY_FONT}">${stats.daysLeftInQuarter}</text>
    <text x="${SAFE_ZONE.left + miniWidth + 46}" y="1202" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">USERS</text>
    <text x="${SAFE_ZONE.left + miniWidth + 46}" y="1276" fill="${theme.ink}" font-size="86" font-family="${DISPLAY_FONT}">${stats.totalUsers}</text>
    <text x="${SAFE_ZONE.left + (miniWidth + 24) * 2 + 22}" y="1194" fill="${theme.ink}" font-size="26" font-family="${SANS_FONT}" font-weight="800">DONORS</text>
    <text x="${SAFE_ZONE.left + (miniWidth + 24) * 2 + 22}" y="1268" fill="${theme.ink}" font-size="76" font-family="${DISPLAY_FONT}">${stats.uniqueDonors}</text>
    ${card(SAFE_ZONE.left, 1348, 728, 120, theme.quaternary, theme, 2.6)}
    <text x="${SAFE_ZONE.left + 30}" y="1426" fill="${theme.ink}" font-size="64" font-family="${DISPLAY_FONT}" letter-spacing="1.1">DM ME WITH QUESTIONS</text>
    <text x="${SAFE_ZONE.left}" y="1442" fill="${theme.muted}" font-size="34" font-family="${MONO_FONT}" textLength="${SAFE_WIDTH}" lengthAdjust="spacingAndGlyphs">friday is the last day of the quarter</text>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#000" filter="url(#grain)" opacity="0.15" />
    ${safeZoneGuides(theme)}
  `;
}

function slideTwo(config: StoryCampaignConfig, theme: Theme): string {
  const { stats, display, liveLabel } = config.storyData;
  return `
    ${baseLayer(theme, 202)}
    ${heroLine("CLAIMANT VIEW", SAFE_ZONE.left, 270, 44, theme.primary, theme)}
    ${card(644, 314, 232, 96, theme.quaternary, theme, -10)}
    <text x="674" y="382" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">CLAIM FAST</text>
    ${heroLine(`${stats.totalUsers} USERS`, SAFE_ZONE.left, 382, 112, theme.paper, theme, SAFE_WIDTH - 14)}
    ${heroLine("IN SLUGSWAP.", SAFE_ZONE.left, 500, 100, theme.highlight, theme, SAFE_WIDTH - 14)}
    ${card(SAFE_ZONE.left, 650, 620, 96, theme.paper, theme, 3)}
    <text x="${SAFE_ZONE.left + 28}" y="716" fill="${theme.ink}" font-size="50" font-family="${DISPLAY_FONT}">${stats.totalUsers} READY TO CLAIM</text>
    ${card(SAFE_ZONE.left, 758, SAFE_WIDTH, 310, theme.highlight, theme, -2.2)}
    <text x="${SAFE_ZONE.left + 34}" y="760" fill="${theme.ink}" font-size="28" font-family="${SANS_FONT}" font-weight="800" letter-spacing="1.1">POINTS AVAILABLE THIS WEEK</text>
    <text x="${SAFE_ZONE.left + 34}" y="950" fill="${theme.ink}" font-size="170" font-family="${DISPLAY_FONT}">${display.availablePointsThisWeek}</text>
    ${card(SAFE_ZONE.left + 18, 1110, SAFE_WIDTH - 36, 190, theme.tertiary, theme, 3.2)}
    <text x="${SAFE_ZONE.left + 30}" y="1188" fill="${theme.ink}" font-size="58" font-family="${DISPLAY_FONT}" letter-spacing="0.8">CLAIM WHILE POINTS</text>
    <text x="${SAFE_ZONE.left + 30}" y="1254" fill="${theme.ink}" font-size="58" font-family="${DISPLAY_FONT}" letter-spacing="0.8">ARE STILL LIVE.</text>
    <text x="${SAFE_ZONE.left}" y="1382" fill="${theme.muted}" font-size="35" font-family="${MONO_FONT}" textLength="${SAFE_WIDTH}" lengthAdjust="spacingAndGlyphs">${liveLabel.toLowerCase()}</text>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#000" filter="url(#grain)" opacity="0.16" />
    ${safeZoneGuides(theme)}
  `;
}

function slideThree(config: StoryCampaignConfig, theme: Theme): string {
  const ctaUrl = escapeXml(config.ctaUrl);
  const pillWidth = (SAFE_WIDTH - 40) / 3;
  return `
    ${baseLayer(theme, 303)}
    ${heroLine("LAST CHANCE TO SHARE", SAFE_ZONE.left, 276, 44, theme.primary, theme)}
    ${heroLine("DONATE THE", SAFE_ZONE.left, 410, 98, theme.paper, theme, SAFE_WIDTH - 8)}
    ${heroLine("LEFTOVERS.", SAFE_ZONE.left, 516, 96, theme.highlight, theme, SAFE_WIDTH - 8)}
    ${heroLine("BEFORE BREAK.", SAFE_ZONE.left, 614, 82, theme.secondary, theme, SAFE_WIDTH - 8)}
    ${card(SAFE_ZONE.left, 760, SAFE_WIDTH, 218, theme.tertiary, theme, 1.6)}
    <text x="${SAFE_ZONE.left + 32}" y="830" fill="${theme.ink}" font-size="46" font-family="${DISPLAY_FONT}" letter-spacing="0.8">NO AWKWARD ASK.</text>
    <text x="${SAFE_ZONE.left + 32}" y="886" fill="${theme.ink}" font-size="46" font-family="${DISPLAY_FONT}" letter-spacing="0.8">NO EXTRA STEPS.</text>
    <text x="${SAFE_ZONE.left + 32}" y="942" fill="${theme.ink}" font-size="46" font-family="${DISPLAY_FONT}" letter-spacing="0.8">JUST MOVE UNUSED POINTS</text>
    <text x="${SAFE_ZONE.left + 32}" y="998" fill="${theme.ink}" font-size="46" font-family="${DISPLAY_FONT}" letter-spacing="0.8">TO STUDENTS WHO CAN</text>
    <text x="${SAFE_ZONE.left + 32}" y="1054" fill="${theme.ink}" font-size="46" font-family="${DISPLAY_FONT}" letter-spacing="0.8">USE THEM THIS WEEK.</text>
    ${card(SAFE_ZONE.left, 1020, pillWidth, 104, theme.paper, theme, -1.2)}
    ${card(SAFE_ZONE.left + pillWidth + 20, 1020, pillWidth, 104, theme.paper, theme, 1.2)}
    ${card(SAFE_ZONE.left + (pillWidth + 20) * 2, 1020, pillWidth, 104, theme.paper, theme, -1.2)}
    <text x="${SAFE_ZONE.left + 86}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">iOS</text>
    <text x="${SAFE_ZONE.left + pillWidth + 74}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">ANDROID</text>
    <text x="${SAFE_ZONE.left + (pillWidth + 20) * 2 + 86}" y="1084" fill="${theme.ink}" font-size="48" font-family="${DISPLAY_FONT}">WEB</text>
    ${card(SAFE_ZONE.left, 1158, SAFE_WIDTH, 142, theme.primary, theme, -1)}
    <text x="${SAFE_ZONE.left + 28}" y="1248" fill="${theme.ink}" font-size="74" font-family="${DISPLAY_FONT}" textLength="${SAFE_WIDTH - 56}" lengthAdjust="spacingAndGlyphs">${ctaUrl}</text>
    ${card(SAFE_ZONE.left, 1328, 720, 116, theme.secondary, theme, 1.2)}
    <text x="${SAFE_ZONE.left + 26}" y="1403" fill="${theme.ink}" font-size="62" font-family="${DISPLAY_FONT}">JOIN + DONATE TODAY</text>
    <text x="${SAFE_ZONE.left}" y="1518" fill="${theme.muted}" font-size="35" font-family="${MONO_FONT}">web + iOS + Android</text>
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

async function loadStoryData(): Promise<StoryDataFile> {
  try {
    const raw = await fs.readFile(STORY_DATA_PATH, "utf8");
    return JSON.parse(raw) as StoryDataFile;
  } catch {
    return FALLBACK_STORY_DATA;
  }
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const storyData = await loadStoryData();

  const configs: StoryCampaignConfig[] = (["option-a", "option-b"] as const).flatMap(
    (variant) =>
      ([1, 2, 3] as const).map((slideIndex) => ({
        variant,
        slideIndex,
        storyData,
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
