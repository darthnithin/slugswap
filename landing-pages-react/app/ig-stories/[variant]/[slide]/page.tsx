import fs from "node:fs/promises";
import path from "node:path";
import { Anton, Sora, Space_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

const anton = Anton({ subsets: ["latin"], weight: "400" });
const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"] });
const space = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

type Variant = "option-a" | "option-b";
type Slide = "1" | "2" | "3";

type Palette = {
  bgA: string;
  bgB: string;
  spot: string;
  ink: string;
  paper: string;
  lime: string;
  cyan: string;
  orange: string;
  magenta: string;
  gold: string;
  violet: string;
};

type StoryStats = {
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
};

type StoryDataFile = {
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
};

const palettes: Record<Variant, Palette> = {
  "option-a": {
    bgA: "#0F1327",
    bgB: "#1B1731",
    spot: "#2C1B41",
    ink: "#0A0B10",
    paper: "#F3F3EF",
    lime: "#D8FF38",
    cyan: "#42D5CE",
    orange: "#FF6F47",
    magenta: "#FF436E",
    gold: "#C99A3A",
    violet: "#7B44F2",
  },
  "option-b": {
    bgA: "#090F22",
    bgB: "#1A0F33",
    spot: "#3B0F4D",
    ink: "#06070D",
    paper: "#F8F8F5",
    lime: "#D7FF2E",
    cyan: "#08CBFF",
    orange: "#FF8B00",
    magenta: "#FF2B8C",
    gold: "#E2B640",
    violet: "#9300FF",
  },
};

const edgeShapes = [
  { top: "-2%", left: "76%", w: 130, h: 90, rot: -20 },
  { top: "4%", left: "-5%", w: 120, h: 78, rot: 18 },
  { top: "10%", left: "88%", w: 100, h: 68, rot: 35 },
  { top: "36%", left: "-7%", w: 112, h: 84, rot: -24 },
  { top: "48%", left: "90%", w: 130, h: 92, rot: 28 },
  { top: "66%", left: "-8%", w: 126, h: 84, rot: -17 },
  { top: "74%", left: "84%", w: 138, h: 96, rot: -30 },
  { top: "87%", left: "8%", w: 115, h: 74, rot: 22 },
  { top: "92%", left: "70%", w: 146, h: 98, rot: -25 },
];

const STORY_DATA_PATH = path.join(
  process.cwd(),
  "public/instagram-stories/end-of-quarter-mar-2026/story-data.json",
);

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

async function loadStoryData(): Promise<StoryDataFile> {
  try {
    const raw = await fs.readFile(STORY_DATA_PATH, "utf8");
    return JSON.parse(raw) as StoryDataFile;
  } catch {
    return FALLBACK_STORY_DATA;
  }
}

function BurstTag({
  children,
  bg,
  color = "#05060B",
  className,
  style,
}: {
  children: ReactNode;
  bg: string;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center border-[5px] border-black/90 px-7 py-4 shadow-[0_8px_0_#08090f] ${className ?? ""}`}
      style={{
        background: bg,
        color,
        clipPath:
          "polygon(12% 0%, 22% 11%, 38% 0%, 49% 12%, 66% 0%, 76% 13%, 89% 4%, 100% 19%, 91% 36%, 100% 49%, 89% 63%, 100% 80%, 85% 93%, 68% 86%, 56% 100%, 42% 87%, 25% 100%, 16% 84%, 0% 79%, 10% 58%, 0% 43%, 12% 27%, 0% 11%)",
        ...style,
      }}
    >
      <span className={`${anton.className} text-[54px] leading-none tracking-tight`}>{children}</span>
    </div>
  );
}

function TapeStrip({
  children,
  bg,
  color = "#05060B",
  className,
  style,
}: {
  children: ReactNode;
  bg: string;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`inline-flex border-[5px] border-black/90 px-6 py-3 shadow-[0_8px_0_#08090f] ${className ?? ""}`}
      style={{ background: bg, color, ...style }}
    >
      <span className={`${space.className} text-[34px] font-extrabold tracking-[0.18em] uppercase`}>
        {children}
      </span>
    </div>
  );
}

function StackCard({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative rounded-2xl border-[5px] border-black/90 shadow-[0_8px_0_#08090f] ${className ?? ""}`}
      style={style}
    >
      <div className="pointer-events-none absolute inset-[10px] rounded-md border-[3px] border-white/70" />
      <div className="relative">{children}</div>
    </div>
  );
}

function Headline({
  className,
  children,
  color,
}: {
  className?: string;
  children: ReactNode;
  color: string;
}) {
  return (
    <h2
      className={`${anton.className} uppercase leading-[0.9] tracking-tight drop-shadow-[4px_6px_0_rgba(0,0,0,0.55)] ${className ?? ""}`}
      style={{ color }}
    >
      {children}
    </h2>
  );
}

function StoryCanvas({
  palette,
  slide,
  storyData,
}: {
  palette: Palette;
  slide: Slide;
  storyData: StoryDataFile;
}) {
  const { stats, display, liveLabel } = storyData;
  const shapeColors = [
    palette.gold,
    palette.cyan,
    palette.orange,
    palette.magenta,
    palette.violet,
    palette.lime,
  ];

  return (
    <main
      className={`${sora.className} relative h-[1920px] w-[1080px] overflow-hidden`}
      style={{
        background: `linear-gradient(145deg, ${palette.bgA}, ${palette.bgB})`,
      }}
      data-story-id={`${slide}`}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(125deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 14px, transparent 14px, transparent 34px)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(circle at 15% 10%, ${palette.spot}99 0%, transparent 50%), radial-gradient(circle at 84% 92%, ${palette.spot}88 0%, transparent 46%)`,
        }}
      />

      {edgeShapes.map((shape, idx) => (
        <div
          // controlled edge chaos only, to protect readability lane
          key={`${shape.top}-${shape.left}-${idx}`}
          className="absolute rounded-2xl border-4 border-black/80 opacity-85"
          style={{
            top: shape.top,
            left: shape.left,
            width: shape.w,
            height: shape.h,
            transform: `rotate(${shape.rot}deg)`,
            background: shapeColors[idx % shapeColors.length],
          }}
        />
      ))}

      <div className="absolute left-[72px] right-[72px] top-[220px] bottom-[260px]">
        {slide === "1" && (
          <section className="relative space-y-7">
            <div className="flex items-start justify-between gap-4">
              <TapeStrip
                bg={palette.lime}
                className="rotate-[-1.8deg]"
                style={{ maxWidth: "72%" }}
              >
                {stats.daysLeftInQuarter} DAYS LEFT
              </TapeStrip>
              <BurstTag bg={palette.orange} className="translate-y-2 rotate-[7deg]">
                FRIDAY
              </BurstTag>
            </div>
            <div className="absolute right-[126px] top-[110px] rotate-[-9deg]">
              <BurstTag bg={palette.magenta}>FINAL DROP</BurstTag>
            </div>

            <div className="space-y-1">
              <Headline color={palette.paper} className="text-[138px] -rotate-[1deg]">
                EVERYTHING
              </Headline>
              <Headline color={palette.lime} className="text-[132px] rotate-[1deg] -mt-2">
                MUST GO.
              </Headline>
              <Headline color={palette.orange} className="text-[108px] -rotate-[1.5deg] -mt-1">
                EXTRA POINTS TOO.
              </Headline>
            </div>

            <StackCard
              className="inline-block px-7 py-4"
              style={{ background: palette.magenta, transform: "rotate(3.2deg)" }}
            >
              <p className={`${anton.className} text-[56px] leading-none text-black`}>
                {stats.uniqueDonors} DONORS ALREADY IN
              </p>
            </StackCard>

            <StackCard
              className="px-9 py-7"
              style={{ background: palette.paper, transform: "rotate(-3deg)" }}
            >
              <p
                className={`${anton.className} text-[64px] leading-[0.92] tracking-tight`}
                style={{ color: palette.ink }}
              >
                {stats.totalUsers} STUDENTS
                <br />
                ARE ON SLUGSWAP.
                <br />
                {stats.uniqueDonors} HAVE
                <br />
                ALREADY DONATED.
              </p>
            </StackCard>

            <div className="grid grid-cols-3 gap-5 pt-1">
              {[
                { label: "DAYS LEFT", value: String(stats.daysLeftInQuarter), bg: palette.gold },
                { label: "USERS", value: String(stats.totalUsers), bg: palette.cyan },
                { label: "DONORS", value: String(stats.uniqueDonors), bg: palette.lime },
              ].map((item, index) => (
                <StackCard
                  key={item.label}
                  className="px-4 py-3"
                  style={{
                    background: item.bg,
                    transform: `rotate(${index === 0 ? "-2.4deg" : index === 1 ? "1.4deg" : "-1.1deg"}) translateY(${index === 1 ? "8px" : "0"})`,
                  }}
                >
                  <p className={`${sora.className} text-[22px] font-extrabold leading-none text-black`}>
                    {item.label}
                  </p>
                  <p className={`${anton.className} text-[76px] leading-none text-black`}>{item.value}</p>
                </StackCard>
              ))}
            </div>

            <StackCard
              className="inline-block px-8 py-4"
              style={{ background: palette.magenta, transform: "rotate(2.6deg)" }}
            >
              <p className={`${anton.className} text-[68px] text-black`}>DM ME WITH QUESTIONS</p>
            </StackCard>

            <p className={`${space.className} text-[40px] font-semibold`} style={{ color: `${palette.paper}B3` }}>
              friday is the last day of the quarter
            </p>
          </section>
        )}

        {slide === "2" && (
          <section className="relative space-y-6">
            <div className="flex items-start justify-between gap-4">
              <TapeStrip bg={palette.gold} className="rotate-[-1.3deg]">
                CLAIMANT VIEW
              </TapeStrip>
              <BurstTag bg={palette.cyan} className="rotate-[8deg]">
                AVAILABLE NOW
              </BurstTag>
            </div>
            <div className="absolute right-[120px] top-[118px] rotate-[-11deg]">
              <BurstTag bg={palette.magenta}>CLAIM FAST</BurstTag>
            </div>

            <div className="space-y-1">
              <Headline color={palette.paper} className="text-[130px] -rotate-[1deg]">
                {stats.totalUsers} USERS
              </Headline>
              <Headline color={palette.lime} className="text-[118px] rotate-[1deg] -mt-2">
                IN SLUGSWAP.
              </Headline>
            </div>

            <StackCard
              className="inline-block px-6 py-3"
              style={{ background: palette.paper, transform: "rotate(2.8deg)" }}
            >
              <p className={`${anton.className} text-[48px] leading-none text-black`}>{stats.totalUsers} READY TO CLAIM</p>
            </StackCard>

            <StackCard className="px-8 py-8" style={{ background: palette.lime, transform: "rotate(-2.2deg)" }}>
              <p className={`${sora.className} text-[28px] font-extrabold tracking-[0.16em] text-black`}>
                POINTS AVAILABLE THIS WEEK
              </p>
              <p className={`${anton.className} mt-2 text-[160px] leading-none text-black`}>
                {display.availablePointsThisWeek}
              </p>
            </StackCard>

            <StackCard
              className="px-7 py-6"
              style={{ background: palette.orange, transform: "rotate(3.2deg)" }}
            >
              <p className={`${anton.className} text-[60px] leading-[0.92] text-black`}>
                CLAIM WHILE POINTS
                <br />
                ARE STILL LIVE.
              </p>
            </StackCard>

            <p className={`${space.className} text-[36px] font-semibold`} style={{ color: `${palette.paper}A8` }}>
              {liveLabel.toLowerCase()}
            </p>
          </section>
        )}

        {slide === "3" && (
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <TapeStrip bg={palette.gold} className="rotate-[-1.3deg]">
                LAST CHANCE TO SHARE
              </TapeStrip>
              <BurstTag bg={palette.magenta} className="rotate-[8deg]">
                THIS WEEK
              </BurstTag>
            </div>

            <div className="space-y-1">
              <Headline color={palette.paper} className="text-[126px]">
                DONATE THE
              </Headline>
              <Headline color={palette.lime} className="text-[118px]">
                LEFTOVERS.
              </Headline>
              <Headline color={palette.cyan} className="text-[98px]">
                BEFORE BREAK.
              </Headline>
            </div>

            <StackCard
              className="px-8 py-6"
              style={{ background: palette.orange, transform: "rotate(1.5deg)" }}
            >
              <p className={`${anton.className} text-[58px] leading-[0.92] text-black`}>
                NO AWKWARD ASK.
                <br />
                NO EXTRA STEPS.
                <br />
                JUST MOVE UNUSED
                <br />
                POINTS TO STUDENTS
                <br />
                WHO CAN USE THEM.
              </p>
            </StackCard>

            <div className="grid grid-cols-3 gap-4">
              {["iOS", "ANDROID", "WEB"].map((platform) => (
                <StackCard key={platform} className="py-3 text-center" style={{ background: palette.paper }}>
                  <p className={`${sora.className} text-[47px] font-extrabold text-black`}>{platform}</p>
                </StackCard>
              ))}
            </div>

            <StackCard className="px-8 py-4" style={{ background: palette.gold }}>
              <p className={`${anton.className} text-[96px] leading-none text-black`}>slugswap.vercel.app</p>
            </StackCard>

            <StackCard className="inline-block px-8 py-3" style={{ background: palette.cyan }}>
              <p className={`${anton.className} text-[70px] text-black`}>JOIN + DONATE TODAY</p>
            </StackCard>

            <p className={`${space.className} text-[34px] font-semibold`} style={{ color: `${palette.paper}A8` }}>
              web + iOS + Android
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

export default async function IGStoryPage({
  params,
}: {
  params: Promise<{ variant: string; slide: string }>;
}) {
  const resolved = await params;
  const storyData = await loadStoryData();
  const variant = resolved.variant as Variant;
  const slide = resolved.slide as Slide;

  if (!(variant in palettes)) notFound();
  if (!["1", "2", "3"].includes(slide)) notFound();

  return (
    <StoryCanvas
      palette={palettes[variant]}
      slide={slide}
      storyData={storyData}
    />
  );
}
