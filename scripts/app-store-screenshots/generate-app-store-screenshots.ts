import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp, { type OverlayOptions } from "sharp";

const execFileAsync = promisify(execFile);

const SCREEN_WIDTH = 1320;
const SCREEN_HEIGHT = 2868;
const PANEL_COUNT = 5;
const MASTER_WIDTH = SCREEN_WIDTH * PANEL_COUNT;

const COLORS = {
  forest: "#183D32",
  forestDeep: "#0D2B24",
  forestMid: "#245245",
  deviceBlueLight: "#9AC2DE",
  gold: "#F4C332",
  cream: "#F6F1E5",
  white: "#FFFDF7",
  moss: "#8CAC79",
} as const;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const ASSET_ROOT = path.join(
  REPO_ROOT,
  "apps/mobile/store-assets/app-store",
);
const SOURCE_DIR = path.join(ASSET_ROOT, "source");
const OUTPUT_DIR = path.join(ASSET_ROOT, "6.9-inch");
const PREVIEW_PATH = path.join(ASSET_ROOT, "panorama-preview.png");
const CUT_GUIDE_PATH = path.join(ASSET_ROOT, "panorama-cut-guide.png");
const MODEL_DIR = path.join(ASSET_ROOT, "3d/iphone-17-pro-max");
const MODEL_PATH = path.join(MODEL_DIR, "iphone-17-pro-max.blend");
const RENDER_DIR = path.join(MODEL_DIR, "renders");
const BLENDER_SCRIPT_PATH = path.join(
  SCRIPT_DIR,
  "blender/render-iphone-mockups.py",
);
const PHONE_RENDER_WIDTH = 1600;
const PHONE_RENDER_HEIGHT = 2800;

const FIGTREE_PATH = path.join(
  REPO_ROOT,
  "apps/mobile/assets/src/brand/source/Figtree-VariableFont_wght.ttf",
);
const NEWSREADER_PATH = path.join(
  REPO_ROOT,
  "node_modules/@expo-google-fonts/newsreader/600SemiBold_Italic/Newsreader_600SemiBold_Italic.ttf",
);

interface StoryPanelConfig {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  output: string;
}

interface PhoneConfig {
  source: string;
  render: string;
  rotation: number;
  phoneX: number;
  phoneY: number;
  phoneWidth: number;
}

const PANELS: StoryPanelConfig[] = [
  {
    eyebrow: "SLUGSWAP FOR UCSC",
    title: "Campus life,",
    accent: "less scattered.",
    description: "Dining, maps, rooms, and GET—together.",
    output: "01-campus-life.png",
  },
  {
    eyebrow: "",
    title: "",
    accent: "",
    description: "",
    output: "02-campus-life-detail.png",
  },
  {
    eyebrow: "DINING",
    title: "Know what’s",
    accent: "for lunch.",
    description: "Live menus without the tab-hopping.",
    output: "03-dining.png",
  },
  {
    eyebrow: "CAMPUS MAP",
    title: "Find anything",
    accent: "on campus.",
    description: "Search the whole UCSC campus in one place.",
    output: "04-campus-map.png",
  },
  {
    eyebrow: "",
    title: "",
    accent: "",
    description: "",
    output: "05-campus-map-detail.png",
  },
];

const PHONES: PhoneConfig[] = [
  {
    source: "01-home.png",
    render: "iphone-17-pro-max-home.png",
    rotation: -7.2,
    phoneX: 760,
    phoneY: 250,
    phoneWidth: 1160,
  },
  {
    source: "02-dining.png",
    render: "iphone-17-pro-max-dining.png",
    rotation: 0.8,
    phoneX: SCREEN_WIDTH * 2 + 220,
    phoneY: 760,
    phoneWidth: 880,
  },
  {
    source: "03-map.png",
    render: "iphone-17-pro-max-map.png",
    rotation: 7.2,
    phoneX: SCREEN_WIDTH * 3 + 800,
    phoneY: 250,
    phoneWidth: 1160,
  },
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fileAsDataUri(filePath: string, mime: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function panelTypography(panel: StoryPanelConfig, index: number): string {
  if (!panel.title) return "";

  const x = index * SCREEN_WIDTH + 96;

  return `
    <g>
      <rect x="${x}" y="108" width="22" height="22" rx="11" fill="${COLORS.gold}"/>
      <text x="${x + 46}" y="134" class="eyebrow">${escapeXml(panel.eyebrow)}</text>
      <text x="${x}" y="354" class="headline">${escapeXml(panel.title)}</text>
      <text x="${x}" y="510" class="headline accent">${escapeXml(panel.accent)}</text>
      <text x="${x}" y="646" class="description">${escapeXml(panel.description)}</text>
    </g>`;
}

function backgroundSvg(figtreeUri: string, newsreaderUri: string): Buffer {
  const typography = PANELS.map(panelTypography).join("\n");

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${MASTER_WIDTH}" height="${SCREEN_HEIGHT}" viewBox="0 0 ${MASTER_WIDTH} ${SCREEN_HEIGHT}">
      <defs>
        <style>
          @font-face { font-family: Figtree; src: url('${figtreeUri}'); }
          @font-face { font-family: Newsreader; src: url('${newsreaderUri}'); }
          .eyebrow { font: 720 31px Figtree, sans-serif; letter-spacing: 5px; fill: ${COLORS.cream}; }
          .headline { font: 760 122px Figtree, sans-serif; letter-spacing: -4px; fill: ${COLORS.white}; }
          .accent { font: 600 italic 132px Newsreader, Georgia, serif; letter-spacing: -2px; fill: ${COLORS.gold}; }
          .description { font: 500 35px Figtree, sans-serif; fill: ${COLORS.cream}; }
        </style>
        <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${COLORS.forestDeep}"/>
          <stop offset="0.5" stop-color="${COLORS.forest}"/>
          <stop offset="1" stop-color="#1E493E"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="${COLORS.deviceBlueLight}" stop-opacity="0.2"/>
          <stop offset="1" stop-color="${COLORS.deviceBlueLight}" stop-opacity="0"/>
        </radialGradient>
        <pattern id="dots" width="96" height="96" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="2.5" fill="${COLORS.white}" opacity="0.07"/>
        </pattern>
      </defs>

      <rect width="${MASTER_WIDTH}" height="${SCREEN_HEIGHT}" fill="url(#background)"/>
      <rect width="${MASTER_WIDTH}" height="${SCREEN_HEIGHT}" fill="url(#dots)"/>

      <ellipse cx="1500" cy="1640" rx="1020" ry="920" fill="url(#glow)"/>
      <ellipse cx="3300" cy="1700" rx="760" ry="700" fill="url(#glow)"/>
      <ellipse cx="5460" cy="1640" rx="1020" ry="920" fill="url(#glow)"/>

      ${typography}
    </svg>
  `);
}

async function recolorAlpha(input: Buffer, color: string): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read the rendered phone dimensions.");
  }

  const fill = Buffer.from(
    `<svg width="${metadata.width}" height="${metadata.height}"><rect width="100%" height="100%" fill="${color}"/></svg>`,
  );

  return sharp(input)
    .composite([{ input: fill, blend: "in" }])
    .png()
    .toBuffer();
}

async function validateSourceScreenshots(): Promise<void> {
  await Promise.all(
    PHONES.map(async ({ source }) => {
      const sourcePath = path.join(SOURCE_DIR, source);
      const metadata = await sharp(sourcePath).metadata();
      if (
        metadata.width !== SCREEN_WIDTH ||
        metadata.height !== SCREEN_HEIGHT
      ) {
        throw new Error(
          `${source} must be ${SCREEN_WIDTH}×${SCREEN_HEIGHT}; received ${metadata.width ?? "?"}×${metadata.height ?? "?"}.`,
        );
      }
    }),
  );
}

async function phoneRendersAreCurrent(): Promise<boolean> {
  try {
    const inputPaths = [
      MODEL_PATH,
      BLENDER_SCRIPT_PATH,
      ...PHONES.map(({ source }) => path.join(SOURCE_DIR, source)),
    ];
    const inputStats = await Promise.all(inputPaths.map((file) => fs.stat(file)));
    const newestInput = Math.max(...inputStats.map((stat) => stat.mtimeMs));

    return (
      await Promise.all(
        PHONES.map(async ({ render }) => {
          const renderPath = path.join(RENDER_DIR, render);
          const [stat, metadata] = await Promise.all([
            fs.stat(renderPath),
            sharp(renderPath).metadata(),
          ]);
          return (
            stat.mtimeMs >= newestInput &&
            metadata.width === PHONE_RENDER_WIDTH &&
            metadata.height === PHONE_RENDER_HEIGHT &&
            metadata.hasAlpha === true
          );
        }),
      )
    ).every(Boolean);
  } catch {
    return false;
  }
}

async function renderPhonesIfNeeded(): Promise<void> {
  await validateSourceScreenshots();
  try {
    await fs.access(MODEL_PATH);
  } catch {
    throw new Error(
      `Missing the licensed iPhone model at ${MODEL_PATH}. Follow the one-time setup in ${path.join(ASSET_ROOT, "README.md")}.`,
    );
  }
  if (await phoneRendersAreCurrent()) return;

  await fs.mkdir(RENDER_DIR, { recursive: true });
  console.log("Rendering iPhone 17 Pro Max mockups with Blender…");
  try {
    const { stdout, stderr } = await execFileAsync(
      "blender",
      [
        "-b",
        MODEL_PATH,
        "--python",
        BLENDER_SCRIPT_PATH,
        "--",
        "--source-dir",
        SOURCE_DIR,
        "--output-dir",
        RENDER_DIR,
        "--width",
        String(PHONE_RENDER_WIDTH),
        "--height",
        String(PHONE_RENDER_HEIGHT),
        "--samples",
        "64",
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to render the iPhone model. Install Blender (brew install --cask blender) and retry. ${message}`,
    );
  }
}

async function prepareRenderedPhone(
  renderPath: string,
  phoneConfig: PhoneConfig,
): Promise<Buffer> {
  const phone = await sharp(renderPath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: phoneConfig.phoneWidth })
    .rotate(phoneConfig.rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const metadata = await sharp(phone).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read the prepared phone dimensions.");
  }

  const padding = 96;
  const shadow = await sharp(await recolorAlpha(phone, "#020D15"))
    .blur(38)
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
      { input: shadow, left: padding + 24, top: padding + 38 },
      { input: phone, left: padding, top: padding },
    ])
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function cropOverlayToMaster(
  input: Buffer,
  left: number,
  top: number,
): Promise<OverlayOptions> {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read the phone overlay dimensions.");
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
    SCREEN_HEIGHT - outputTop,
  );

  if (width <= 0 || height <= 0) {
    throw new Error("A phone overlay sits entirely outside the panorama.");
  }

  const cropped = await sharp(input)
    .extract({ left: sourceLeft, top: sourceTop, width, height })
    .png()
    .toBuffer();

  return { input: cropped, left: outputLeft, top: outputTop };
}

async function buildMaster(): Promise<Buffer> {
  const [figtreeUri, newsreaderUri] = await Promise.all([
    fileAsDataUri(FIGTREE_PATH, "font/ttf"),
    fileAsDataUri(NEWSREADER_PATH, "font/ttf"),
  ]);
  const composites: OverlayOptions[] = [];

  for (const phoneConfig of PHONES) {
    const phone = await prepareRenderedPhone(
      path.join(RENDER_DIR, phoneConfig.render),
      phoneConfig,
    );
    composites.push(
      await cropOverlayToMaster(
        phone,
        phoneConfig.phoneX,
        phoneConfig.phoneY,
      ),
    );
  }

  return sharp(backgroundSvg(figtreeUri, newsreaderUri))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function writeCutGuide(master: Buffer): Promise<void> {
  const guideWidth = 2640;
  const guideHeight = Math.round((SCREEN_HEIGHT * guideWidth) / MASTER_WIDTH);
  const guide = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${guideWidth}" height="${guideHeight}">
      ${Array.from({ length: PANEL_COUNT - 1 }, (_, index) => {
        const x = ((index + 1) * guideWidth) / PANEL_COUNT;
        return `<line x1="${x}" y1="0" x2="${x}" y2="${guideHeight}" stroke="#FF4D5A" stroke-width="6" stroke-dasharray="16 10"/>`;
      }).join("\n")}
    </svg>
  `);
  const preview = await sharp(master)
    .resize(guideWidth, guideHeight, { fit: "fill" })
    .png()
    .toBuffer();

  await sharp(preview)
    .composite([{ input: guide, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(CUT_GUIDE_PATH);
}

async function main(): Promise<void> {
  await renderPhonesIfNeeded();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const existingOutputs = await fs.readdir(OUTPUT_DIR);
  await Promise.all(
    existingOutputs
      .filter((name) => name.endsWith(".png"))
      .map((name) => fs.unlink(path.join(OUTPUT_DIR, name))),
  );
  const master = await buildMaster();

  await Promise.all(
    PANELS.map((panel, index) =>
      sharp(master)
        .extract({
          left: index * SCREEN_WIDTH,
          top: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
        })
        .flatten({ background: COLORS.forest })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(path.join(OUTPUT_DIR, panel.output)),
    ),
  );

  await Promise.all([
    sharp(master)
      .flatten({ background: COLORS.forest })
      .resize({ width: 2640 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(PREVIEW_PATH),
    writeCutGuide(master),
  ]);

  console.log(`Generated ${PANELS.length} App Store screenshots in ${OUTPUT_DIR}`);
  console.log(`Panoramic preview: ${PREVIEW_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
