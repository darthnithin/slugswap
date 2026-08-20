import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";

const PANEL_WIDTH = 1320;
const PANEL_HEIGHT = 2868;
const PANEL_COUNT = 5;
const MASTER_WIDTH = PANEL_WIDTH * PANEL_COUNT;
const PREVIEW_WIDTH = 2640;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const ASSET_ROOT = path.join(
  REPO_ROOT,
  "apps/mobile/store-assets/app-store",
);
const RENDER_DIR = path.join(
  ASSET_ROOT,
  "3d/iphone-17-pro-max/renders",
);
const OPTIONS_ROOT = path.join(ASSET_ROOT, "options");
const FIGTREE_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/assets/src/brand/source/Figtree-VariableFont_wght.ttf",
);
const NEWSREADER_REGULAR_PATH = path.join(
  REPO_ROOT,
  "node_modules/@expo-google-fonts/newsreader/600SemiBold/Newsreader_600SemiBold.ttf",
);
const NEWSREADER_ITALIC_PATH = path.join(
  REPO_ROOT,
  "node_modules/@expo-google-fonts/newsreader/600SemiBold_Italic/Newsreader_600SemiBold_Italic.ttf",
);

const OUTPUT_NAMES = [
  "01-overview.png",
  "02-dining.png",
  "03-room-reservations.png",
  "04-campus-map.png",
  "05-point-sharing.png",
] as const;

interface FontUris {
  figtree: string;
  newsreader: string;
  newsreaderItalic: string;
}

interface PhonePlacement {
  render:
    | "iphone-17-pro-max-home.png"
    | "iphone-17-pro-max-dining.png"
    | "iphone-17-pro-max-rooms.png"
    | "iphone-17-pro-max-map-front.png"
    | "iphone-17-pro-max-sharing.png";
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface DesignOption {
  id: "midnight" | "editorial" | "poster";
  name: string;
  description: string;
  background: string;
  shadow: string;
  phones: PhonePlacement[];
  svg: (fonts: FontUris) => Buffer;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fileAsDataUri(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return `data:font/ttf;base64,${data.toString("base64")}`;
}

function fontFaces(fonts: FontUris): string {
  return `
    @font-face { font-family: Figtree; src: url('${fonts.figtree}'); }
    @font-face { font-family: Newsreader; src: url('${fonts.newsreader}'); }
    @font-face { font-family: NewsreaderItalic; src: url('${fonts.newsreaderItalic}'); }
  `;
}

function midnightSvg(fonts: FontUris): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" viewBox="0 0 ${MASTER_WIDTH} ${PANEL_HEIGHT}">
      <defs>
        <style>
          ${fontFaces(fonts)}
          .eyebrow { font: 720 27px Figtree, sans-serif; letter-spacing: 6px; fill: #89D8FF; }
          .headline { font: 760 104px Figtree, sans-serif; letter-spacing: -4px; fill: #F8FCFF; }
          .accent { font: 600 italic 112px NewsreaderItalic, serif; fill: #76D5FF; }
          .body { font: 500 30px Figtree, sans-serif; fill: #C6E5F5; }
          .index { font: 700 26px Figtree, sans-serif; letter-spacing: 4px; fill: #76D5FF; }
        </style>
        <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#031426"/>
          <stop offset="0.46" stop-color="#082E55"/>
          <stop offset="1" stop-color="#0C5675"/>
        </linearGradient>
        <radialGradient id="aquaGlow">
          <stop offset="0" stop-color="#2DC7FF" stop-opacity="0.32"/>
          <stop offset="1" stop-color="#2DC7FF" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="violetGlow">
          <stop offset="0" stop-color="#5C71FF" stop-opacity="0.28"/>
          <stop offset="1" stop-color="#5C71FF" stop-opacity="0"/>
        </radialGradient>
        <pattern id="nightDots" width="104" height="104" patternUnits="userSpaceOnUse">
          <circle cx="9" cy="9" r="2.5" fill="#BDEAFF" opacity="0.1"/>
        </pattern>
      </defs>
      <rect width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" fill="url(#night)"/>
      <rect width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" fill="url(#nightDots)"/>
      <ellipse cx="620" cy="1650" rx="760" ry="980" fill="url(#aquaGlow)"/>
      <ellipse cx="1960" cy="1670" rx="700" ry="900" fill="url(#violetGlow)"/>
      <ellipse cx="3300" cy="1670" rx="700" ry="900" fill="url(#aquaGlow)"/>
      <ellipse cx="4620" cy="1670" rx="700" ry="900" fill="url(#violetGlow)"/>
      <ellipse cx="6000" cy="1650" rx="760" ry="980" fill="url(#aquaGlow)"/>
      <path d="M-80 2320 C1150 2060 1850 2700 3030 2330 S5140 1990 6740 2290" fill="none" stroke="#8FDDFF" stroke-width="3" opacity="0.22"/>
      <path d="M-80 2390 C1150 2130 1850 2770 3030 2400 S5140 2060 6740 2360" fill="none" stroke="#8FDDFF" stroke-width="2" opacity="0.12"/>

      <g transform="translate(72 0)">
        <text x="0" y="125" class="eyebrow">BUILT FOR UCSC</text>
        <text x="0" y="315" class="headline">UCSC tools.</text>
        <text x="0" y="430" class="accent">One app.</text>
        <text x="0" y="535" class="body">Dining, rooms, maps, GET, and point sharing.</text>
        <text x="0" y="2780" class="index">01  /  OVERVIEW</text>
      </g>

      <g transform="translate(${PANEL_WIDTH + 72} 0)">
        <text x="0" y="125" class="eyebrow">DINING</text>
        <text x="0" y="315" class="headline">Today’s menu,</text>
        <text x="0" y="430" class="accent">at a glance.</text>
        <text x="0" y="535" class="body">See what’s open and what’s being served.</text>
        <text x="0" y="2780" class="index">02  /  DINING</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 2 + 72} 0)">
        <text x="0" y="125" class="eyebrow">STUDY ROOMS</text>
        <text x="0" y="315" class="headline">Reserve a</text>
        <text x="0" y="430" class="accent">study room.</text>
        <text x="0" y="535" class="body">See open times at McHenry and S&amp;E.</text>
        <text x="0" y="2780" class="index">03  /  ROOMS</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 3 + 72} 0)">
        <text x="0" y="125" class="eyebrow">CAMPUS MAP</text>
        <text x="0" y="315" class="headline">Find anything</text>
        <text x="0" y="430" class="accent">on campus.</text>
        <text x="0" y="535" class="body">Search buildings, dining, and study spots.</text>
        <text x="0" y="2780" class="index">04  /  MAP</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 4 + 72} 0)">
        <text x="0" y="125" class="eyebrow">POINT SHARING</text>
        <text x="0" y="315" class="headline">Share extra</text>
        <text x="0" y="430" class="accent">meal points.</text>
        <text x="0" y="535" class="body">Choose a weekly limit. Pause anytime.</text>
        <text x="0" y="2780" class="index">05  /  SHARE</text>
      </g>
    </svg>
  `);
}

function editorialSvg(fonts: FontUris): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" viewBox="0 0 ${MASTER_WIDTH} ${PANEL_HEIGHT}">
      <defs>
        <style>
          ${fontFaces(fonts)}
          .eyebrow { font: 760 25px Figtree, sans-serif; letter-spacing: 5px; fill: #173E33; }
          .headline { font: 600 104px Newsreader, serif; letter-spacing: -2px; fill: #102D26; }
          .body { font: 520 30px Figtree, sans-serif; fill: #49665D; }
          .caption { font: 680 25px Figtree, sans-serif; letter-spacing: 3px; fill: #102D26; }
          .folio { font: 600 60px NewsreaderItalic, serif; fill: #F06449; }
        </style>
        <pattern id="paperGrid" width="132" height="132" patternUnits="userSpaceOnUse">
          <path d="M132 0H0V132" fill="none" stroke="#173E33" stroke-width="1" opacity="0.055"/>
        </pattern>
      </defs>
      <rect width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" fill="#F4EEDF"/>
      <rect width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" fill="url(#paperGrid)"/>
      <rect x="${PANEL_WIDTH - 72}" y="0" width="72" height="${PANEL_HEIGHT}" fill="#17483A"/>
      <rect x="${PANEL_WIDTH * 2 - 72}" y="0" width="72" height="${PANEL_HEIGHT}" fill="#F1C43C"/>
      <rect x="${PANEL_WIDTH * 3 - 72}" y="0" width="72" height="${PANEL_HEIGHT}" fill="#F06449"/>
      <rect x="${PANEL_WIDTH * 4 - 72}" y="0" width="72" height="${PANEL_HEIGHT}" fill="#8DC9D8"/>
      <circle cx="650" cy="2290" r="250" fill="#DCE5CF"/>
      <circle cx="1980" cy="2290" r="250" fill="#F3C73B" opacity="0.82"/>
      <circle cx="3300" cy="2290" r="250" fill="#F2B6A9" opacity="0.82"/>
      <circle cx="4620" cy="2290" r="250" fill="#B6DCE4" opacity="0.82"/>
      <circle cx="5940" cy="2290" r="250" fill="#DCE5CF"/>

      <g transform="translate(72 0)">
        <text x="0" y="125" class="eyebrow">SLUGSWAP  /  OVERVIEW</text>
        <text x="0" y="305" class="headline">UCSC tools.</text>
        <text x="0" y="415" class="headline">One app.</text>
        <text x="0" y="525" class="body">Dining, rooms, maps, GET, and point sharing.</text>
        <text x="0" y="2780" class="caption">BUILT FOR UCSC</text>
        <text x="1110" y="2780" class="folio">1</text>
      </g>

      <g transform="translate(${PANEL_WIDTH + 72} 0)">
        <text x="0" y="125" class="eyebrow">DINING  /  UPDATED LIVE</text>
        <text x="0" y="305" class="headline">Today’s menu,</text>
        <text x="0" y="415" class="headline">at a glance.</text>
        <text x="0" y="525" class="body">See what’s open and what’s being served.</text>
        <text x="0" y="2780" class="caption">WHAT’S FOR LUNCH?</text>
        <text x="1110" y="2780" class="folio">2</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 2 + 72} 0)">
        <text x="0" y="125" class="eyebrow">ROOMS  /  LIVE AVAILABILITY</text>
        <text x="0" y="305" class="headline">Reserve a</text>
        <text x="0" y="415" class="headline">study room.</text>
        <text x="0" y="525" class="body">See open times at McHenry and S&amp;E.</text>
        <text x="0" y="2780" class="caption">FIND A ROOM</text>
        <text x="1110" y="2780" class="folio">3</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 3 + 72} 0)">
        <text x="0" y="125" class="eyebrow">MAP  /  UCSC</text>
        <text x="0" y="305" class="headline">Find anything</text>
        <text x="0" y="415" class="headline">on campus.</text>
        <text x="0" y="525" class="body">Search buildings, dining, and study spots.</text>
        <text x="0" y="2780" class="caption">FIND YOUR WAY</text>
        <text x="1110" y="2780" class="folio">4</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 4 + 72} 0)">
        <text x="0" y="125" class="eyebrow">POINT SHARING  /  YOUR LIMIT</text>
        <text x="0" y="305" class="headline">Share extra</text>
        <text x="0" y="415" class="headline">meal points.</text>
        <text x="0" y="525" class="body">Choose a weekly limit. Pause anytime.</text>
        <text x="0" y="2780" class="caption">HELP ANOTHER SLUG</text>
        <text x="1110" y="2780" class="folio">5</text>
      </g>
    </svg>
  `);
}

function posterSvg(fonts: FontUris): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" viewBox="0 0 ${MASTER_WIDTH} ${PANEL_HEIGHT}">
      <defs>
        <style>
          ${fontFaces(fonts)}
          .headline { font: 850 112px Figtree, sans-serif; letter-spacing: -5px; fill: #102D27; }
          .body { font: 580 30px Figtree, sans-serif; fill: #173F35; }
          .stamp { font: 820 24px Figtree, sans-serif; letter-spacing: 4px; fill: #FFF9E9; }
          .headline-light { font: 850 112px Figtree, sans-serif; letter-spacing: -5px; fill: #FFF9E9; }
          .body-light { font: 580 30px Figtree, sans-serif; fill: #E8F2E7; }
          .stamp-dark { font: 820 24px Figtree, sans-serif; letter-spacing: 4px; fill: #173F35; }
          .number { font: 900 250px Figtree, sans-serif; letter-spacing: -14px; fill: none; stroke: #173F35; stroke-width: 4px; opacity: 0.1; }
          .number-light { font: 900 250px Figtree, sans-serif; letter-spacing: -14px; fill: none; stroke: #FFF9E9; stroke-width: 4px; opacity: 0.1; }
        </style>
        <pattern id="posterDots" width="54" height="54" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2.4" fill="#173F35" opacity="0.12"/>
        </pattern>
      </defs>
      <rect width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#F6C735"/>
      <rect x="${PANEL_WIDTH}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#DCE5CF"/>
      <rect x="${PANEL_WIDTH * 2}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#F16B51"/>
      <rect x="${PANEL_WIDTH * 3}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#8DC9D8"/>
      <rect x="${PANEL_WIDTH * 4}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="#173F35"/>
      <rect width="${MASTER_WIDTH}" height="${PANEL_HEIGHT}" fill="url(#posterDots)"/>
      <path d="M-100 2440 C950 2230 1640 2710 2700 2430 S4690 2050 6700 2480" fill="none" stroke="#FFF8E6" stroke-width="70" opacity="0.7"/>
      <path d="M-100 2440 C950 2230 1640 2710 2700 2430 S4690 2050 6700 2480" fill="none" stroke="#173F35" stroke-width="7" stroke-dasharray="28 32" opacity="0.4"/>

      <rect x="72" y="72" width="360" height="58" fill="#173F35"/>
      <text x="98" y="113" class="stamp">BUILT FOR UCSC</text>
      <rect x="${PANEL_WIDTH + 72}" y="72" width="230" height="58" fill="#173F35"/>
      <text x="${PANEL_WIDTH + 98}" y="113" class="stamp">DINING</text>
      <rect x="${PANEL_WIDTH * 2 + 72}" y="72" width="315" height="58" fill="#173F35"/>
      <text x="${PANEL_WIDTH * 2 + 98}" y="113" class="stamp">STUDY ROOMS</text>
      <rect x="${PANEL_WIDTH * 3 + 72}" y="72" width="305" height="58" fill="#173F35"/>
      <text x="${PANEL_WIDTH * 3 + 98}" y="113" class="stamp">CAMPUS MAP</text>
      <rect x="${PANEL_WIDTH * 4 + 72}" y="72" width="350" height="58" fill="#F6C735"/>
      <text x="${PANEL_WIDTH * 4 + 98}" y="113" class="stamp-dark">POINT SHARING</text>

      <g transform="translate(72 0)">
        <text x="0" y="285" class="headline">UCSC tools.</text>
        <text x="0" y="405" class="headline">One app.</text>
        <text x="0" y="510" class="body">Dining, rooms, maps, GET, and point sharing.</text>
        <text x="0" y="2760" class="number">01</text>
      </g>

      <g transform="translate(${PANEL_WIDTH + 72} 0)">
        <text x="0" y="285" class="headline">Today’s menu,</text>
        <text x="0" y="405" class="headline">at a glance.</text>
        <text x="0" y="510" class="body">See what’s open and what’s being served.</text>
        <text x="0" y="2760" class="number">02</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 2 + 72} 0)">
        <text x="0" y="285" class="headline">Reserve a</text>
        <text x="0" y="405" class="headline">study room.</text>
        <text x="0" y="510" class="body">See open times at McHenry and S&amp;E.</text>
        <text x="0" y="2760" class="number">03</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 3 + 72} 0)">
        <text x="0" y="285" class="headline">Find anything</text>
        <text x="0" y="405" class="headline">on campus.</text>
        <text x="0" y="510" class="body">Search buildings, dining, and study spots.</text>
        <text x="0" y="2760" class="number">04</text>
      </g>

      <g transform="translate(${PANEL_WIDTH * 4 + 72} 0)">
        <text x="0" y="285" class="headline-light">Share extra</text>
        <text x="0" y="405" class="headline-light">meal points.</text>
        <text x="0" y="510" class="body-light">Choose a weekly limit. Pause anytime.</text>
        <text x="0" y="2760" class="number-light">05</text>
      </g>
    </svg>
  `);
}

const OPTIONS: DesignOption[] = [
  {
    id: "midnight",
    name: "Midnight Glass",
    description: "Premium blue, atmospheric, and closest to the ScreenshotOtter feel.",
    background: "#062746",
    shadow: "#00101E",
    phones: [
      { render: "iphone-17-pro-max-home.png", x: 90, y: 680, width: 1120, rotation: -8.5 },
      { render: "iphone-17-pro-max-dining.png", x: PANEL_WIDTH + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-rooms.png", x: PANEL_WIDTH * 2 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-map-front.png", x: PANEL_WIDTH * 3 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-sharing.png", x: PANEL_WIDTH * 4 + 170, y: 680, width: 1120, rotation: 8.5 },
    ],
    svg: midnightSvg,
  },
  {
    id: "editorial",
    name: "Campus Editorial",
    description: "Warm, refined, spacious, and more like a contemporary campus magazine.",
    background: "#F4EEDF",
    shadow: "#0B211C",
    phones: [
      { render: "iphone-17-pro-max-home.png", x: 90, y: 680, width: 1120, rotation: -8.5 },
      { render: "iphone-17-pro-max-dining.png", x: PANEL_WIDTH + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-rooms.png", x: PANEL_WIDTH * 2 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-map-front.png", x: PANEL_WIDTH * 3 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-sharing.png", x: PANEL_WIDTH * 4 + 170, y: 680, width: 1120, rotation: 8.5 },
    ],
    svg: editorialSvg,
  },
  {
    id: "poster",
    name: "Banana Slug Poster",
    description: "Five dense feature panels: angled ends, head-on Dining, Rooms, and Map in the middle.",
    background: "#F6C735",
    shadow: "#102D27",
    phones: [
      { render: "iphone-17-pro-max-home.png", x: 90, y: 680, width: 1120, rotation: -8.5 },
      { render: "iphone-17-pro-max-dining.png", x: PANEL_WIDTH + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-rooms.png", x: PANEL_WIDTH * 2 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-map-front.png", x: PANEL_WIDTH * 3 + 135, y: 710, width: 1050, rotation: 0 },
      { render: "iphone-17-pro-max-sharing.png", x: PANEL_WIDTH * 4 + 170, y: 680, width: 1120, rotation: 8.5 },
    ],
    svg: posterSvg,
  },
];

async function recolorAlpha(input: Buffer, color: string): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read a rendered phone.");
  }
  const fill = Buffer.from(
    `<svg width="${metadata.width}" height="${metadata.height}"><rect width="100%" height="100%" fill="${color}"/></svg>`,
  );
  return sharp(input)
    .composite([{ input: fill, blend: "in" }])
    .png()
    .toBuffer();
}

async function preparePhone(
  placement: PhonePlacement,
  shadowColor: string,
): Promise<Buffer> {
  const renderPath = path.join(RENDER_DIR, placement.render);
  const phone = await sharp(renderPath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: placement.width })
    .rotate(placement.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const metadata = await sharp(phone).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to prepare ${placement.render}.`);
  }

  const shadowPadding = 100;
  const shadowOffsetX = 28;
  const shadowOffsetY = 42;
  const padding = shadowPadding + shadowOffsetY + 24;
  const shadow = await sharp(await recolorAlpha(phone, shadowColor))
    .extend({
      top: shadowPadding,
      right: shadowPadding,
      bottom: shadowPadding,
      left: shadowPadding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(42)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: metadata.width + padding * 2,
      height: metadata.height + padding * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: shadow,
        left: padding + shadowOffsetX - shadowPadding,
        top: padding + shadowOffsetY - shadowPadding,
      },
      { input: phone, left: padding, top: padding },
    ])
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function cropToMaster(
  input: Buffer,
  left: number,
  top: number,
): Promise<OverlayOptions> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read a phone overlay.");
  }

  const sourceLeft = Math.max(0, -left);
  const sourceTop = Math.max(0, -top);
  const outputLeft = Math.max(0, left);
  const outputTop = Math.max(0, top);
  const width = Math.min(
    metadata.width - sourceLeft,
    MASTER_WIDTH - outputLeft,
  );
  const height = Math.min(
    metadata.height - sourceTop,
    PANEL_HEIGHT - outputTop,
  );
  if (width <= 0 || height <= 0) {
    throw new Error("A phone sits outside the panorama.");
  }

  const cropped = await sharp(input)
    .extract({ left: sourceLeft, top: sourceTop, width, height })
    .png()
    .toBuffer();
  return { input: cropped, left: outputLeft, top: outputTop };
}

async function buildMaster(
  option: DesignOption,
  fonts: FontUris,
): Promise<Buffer> {
  const phones = await Promise.all(
    option.phones.map(async (placement) => {
      const prepared = await preparePhone(placement, option.shadow);
      return cropToMaster(prepared, placement.x, placement.y);
    }),
  );

  return sharp(option.svg(fonts))
    .composite(phones)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeCutGuide(master: Buffer, outputPath: string): Promise<void> {
  const guideHeight = Math.round((PANEL_HEIGHT * PREVIEW_WIDTH) / MASTER_WIDTH);
  const guide = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${guideHeight}">
      ${Array.from({ length: PANEL_COUNT - 1 }, (_, index) => {
        const x = ((index + 1) * PREVIEW_WIDTH) / PANEL_COUNT;
        return `<line x1="${x}" y1="0" x2="${x}" y2="${guideHeight}" stroke="#FF3158" stroke-width="5" stroke-dasharray="14 10"/>`;
      }).join("\n")}
    </svg>
  `);
  const preview = await sharp(master)
    .resize(PREVIEW_WIDTH, guideHeight, { fit: "fill" })
    .png()
    .toBuffer();
  await sharp(preview)
    .composite([{ input: guide, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function writeOption(
  option: DesignOption,
  master: Buffer,
): Promise<void> {
  const optionRoot = path.join(OPTIONS_ROOT, option.id);
  const outputDir = path.join(optionRoot, "6.9-inch");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all(
    OUTPUT_NAMES.map((name, index) =>
      sharp(master)
        .extract({
          left: index * PANEL_WIDTH,
          top: 0,
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
        })
        .flatten({ background: option.background })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(path.join(outputDir, name)),
    ),
  );

  await Promise.all([
    sharp(master)
      .flatten({ background: option.background })
      .resize({ width: PREVIEW_WIDTH })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(optionRoot, "preview.png")),
    writeCutGuide(master, path.join(optionRoot, "cut-guide.png")),
  ]);
}

async function writeComparison(
  options: DesignOption[],
  masters: Buffer[],
  fonts: FontUris,
): Promise<void> {
  const canvasWidth = 2880;
  const previewWidth = 2640;
  const previewHeight = Math.round((PANEL_HEIGHT * previewWidth) / MASTER_WIDTH);
  const labelHeight = 170;
  const rowGap = 70;
  const topPadding = 90;
  const canvasHeight =
    topPadding + options.length * (labelHeight + previewHeight + rowGap);
  const composites: OverlayOptions[] = [];

  for (const [index, option] of options.entries()) {
    const rowTop = topPadding + index * (labelHeight + previewHeight + rowGap);
    const label = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${labelHeight}">
        <style>${fontFaces(fonts)}</style>
        <text x="0" y="68" font-family="Figtree" font-size="58" font-weight="780" fill="#142A25">${index + 1}. ${escapeXml(option.name)}</text>
        <text x="0" y="125" font-family="Figtree" font-size="31" font-weight="500" fill="#526861">${escapeXml(option.description)}</text>
      </svg>
    `);
    const preview = await sharp(masters[index])
      .resize(previewWidth, previewHeight, { fit: "fill" })
      .flatten({ background: option.background })
      .png()
      .toBuffer();
    composites.push(
      { input: label, left: 120, top: rowTop },
      { input: preview, left: 120, top: rowTop + labelHeight },
    );
  }

  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: "#F7F4EC",
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(OPTIONS_ROOT, "style-options-preview.png"));
}

async function main(): Promise<void> {
  await Promise.all(
    [
      "iphone-17-pro-max-home.png",
      "iphone-17-pro-max-dining.png",
      "iphone-17-pro-max-rooms.png",
      "iphone-17-pro-max-map-front.png",
      "iphone-17-pro-max-sharing.png",
    ].map(async (name) => {
      try {
        await fs.access(path.join(RENDER_DIR, name));
      } catch {
        throw new Error(
          `Missing ${name}. Run npm run app-store:generate before generating options.`,
        );
      }
    }),
  );
  await fs.mkdir(OPTIONS_ROOT, { recursive: true });

  const [figtree, newsreader, newsreaderItalic] = await Promise.all([
    fileAsDataUri(FIGTREE_PATH),
    fileAsDataUri(NEWSREADER_REGULAR_PATH),
    fileAsDataUri(NEWSREADER_ITALIC_PATH),
  ]);
  const fonts = { figtree, newsreader, newsreaderItalic };
  const masters = await Promise.all(
    OPTIONS.map((option) => buildMaster(option, fonts)),
  );
  await Promise.all(
    OPTIONS.map((option, index) => writeOption(option, masters[index])),
  );
  await writeComparison(OPTIONS, masters, fonts);

  console.log(`Generated ${OPTIONS.length} App Store design options in ${OPTIONS_ROOT}`);
  console.log(
    `Comparison: ${path.join(OPTIONS_ROOT, "style-options-preview.png")}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
