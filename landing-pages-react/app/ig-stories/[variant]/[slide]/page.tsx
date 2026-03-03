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

const statsTiles = [
  { label: "ACTIVE DONORS", value: "1" },
  { label: "CLAIMS / WEEK", value: "12" },
  { label: "REDEEM RATE", value: "100%" },
  { label: "TOTAL USERS", value: "21" },
  { label: "GET LINKED", value: "9" },
  { label: "ALL-TIME", value: "28" },
  { label: "POINTS DIST.", value: "497.8" },
  { label: "AVG DON / WK", value: "30" },
  { label: "AVG PTS/REQ", value: "19.3" },
];

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
}: {
  palette: Palette;
  slide: Slide;
}) {
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
          <section className="space-y-8">
            <p
              className={`${space.className} text-[52px] font-bold tracking-tight`}
              style={{ color: palette.lime }}
            >
              ONLY 1 MONTH LEFT IN THE QUARTER
            </p>

            <div className="space-y-2">
              <Headline color={palette.paper} className="text-[128px]">
                ON TRACK TO USE
              </Headline>
              <Headline color={palette.cyan} className="text-[120px]">
                ALL YOUR
              </Headline>
              <Headline color={palette.orange} className="text-[118px]">
                SLUGPOINTS?
              </Headline>
            </div>

            <StackCard
              className="px-9 py-7"
              style={{ background: palette.orange, transform: "rotate(-1.8deg)" }}
            >
              <p
                className={`${anton.className} text-[66px] leading-[0.93] tracking-tight`}
                style={{ color: palette.ink }}
              >
                DONATE EXTRA POINTS
                <br />
                TO OTHER STUDENTS
                <br />
                THROUGH SLUGSWAP.
              </p>
            </StackCard>

            <div className="grid grid-cols-3 gap-5">
              {[
                { label: "ACTIVE DONORS", value: "1", bg: palette.gold },
                { label: "CLAIMS / WEEK", value: "12", bg: palette.cyan },
                { label: "REDEEM RATE", value: "100%", bg: palette.lime },
              ].map((item) => (
                <StackCard key={item.label} className="px-4 py-3" style={{ background: item.bg }}>
                  <p className={`${sora.className} text-[22px] font-extrabold leading-none text-black`}>
                    {item.label}
                  </p>
                  <p className={`${anton.className} text-[76px] leading-none text-black`}>{item.value}</p>
                </StackCard>
              ))}
            </div>

            <StackCard
              className="inline-block px-8 py-4"
              style={{ background: palette.gold, transform: "rotate(-1deg)" }}
            >
              <p className={`${anton.className} text-[76px] text-black`}>DONATE ON SLUGSWAP</p>
            </StackCard>

            <p className={`${space.className} text-[40px] font-semibold`} style={{ color: `${palette.paper}B3` }}>
              now on Web + Android + iOS
            </p>
          </section>
        )}

        {slide === "2" && (
          <section className="space-y-6">
            <p
              className={`${space.className} text-[52px] font-bold tracking-tight`}
              style={{ color: palette.gold }}
            >
              WEEK OF MAR 1 — MAR 8, 2026
            </p>

            <div className="space-y-1">
              <Headline color={palette.paper} className="text-[106px]">
                THE NEED IS REAL.
              </Headline>
              <Headline color={palette.paper} className="text-[106px]">
                THE IMPACT IS REAL.
              </Headline>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              {statsTiles.map((tile, idx) => {
                const tilePalette = [
                  palette.orange,
                  palette.cyan,
                  palette.lime,
                  palette.magenta,
                  palette.gold,
                  palette.orange,
                  palette.cyan,
                  palette.lime,
                  palette.magenta,
                ];
                return (
                  <StackCard
                    key={`${tile.label}-${tile.value}`}
                    className="px-4 py-3"
                    style={{
                      background: tilePalette[idx],
                      transform: `rotate(${idx % 2 === 0 ? "-0.8deg" : "0.8deg"})`,
                    }}
                  >
                    <p className={`${sora.className} text-[21px] font-extrabold leading-none text-black`}>
                      {tile.label}
                    </p>
                    <p className={`${anton.className} text-[70px] leading-none text-black`}>{tile.value}</p>
                  </StackCard>
                );
              })}
            </div>

            <StackCard
              className="px-7 py-5"
              style={{ background: palette.orange, transform: "rotate(-1deg)" }}
            >
              <p className={`${anton.className} text-[62px] leading-[0.92] text-black`}>
                STUDENTS ARE REDEEMING
                <br />
                SUCCESSFULLY.
                <br />
                WE NEED MORE DONORS.
              </p>
            </StackCard>

            <p className={`${space.className} text-[36px] font-semibold`} style={{ color: `${palette.paper}A8` }}>
              users 21 • all-time claims 28
            </p>
          </section>
        )}

        {slide === "3" && (
          <section className="space-y-6">
            <p
              className={`${space.className} text-[50px] font-bold tracking-tight`}
              style={{ color: palette.gold }}
            >
              ONLY 1 MONTH LEFT • MARCH 2026
            </p>

            <div className="space-y-1">
              <Headline color={palette.paper} className="text-[126px]">
                DONATE NOW.
              </Headline>
              <Headline color={palette.lime} className="text-[116px]">
                NOW ON WEB +
              </Headline>
              <Headline color={palette.cyan} className="text-[116px]">
                ANDROID
              </Headline>
            </div>

            <StackCard
              className="px-8 py-6"
              style={{ background: palette.orange, transform: "rotate(1.5deg)" }}
            >
              <p className={`${anton.className} text-[62px] leading-[0.92] text-black`}>
                GOT EXTRA POINTS BEFORE
                <br />
                QUARTER ENDS?
                <br />
                PUT THEM TO WORK TODAY.
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
              <p className={`${anton.className} text-[74px] text-black`}>JOIN + DONATE</p>
            </StackCard>

            <p className={`${space.className} text-[34px] font-semibold`} style={{ color: `${palette.paper}A8` }}>
              also available on iOS
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
  const variant = resolved.variant as Variant;
  const slide = resolved.slide as Slide;

  if (!(variant in palettes)) notFound();
  if (!["1", "2", "3"].includes(slide)) notFound();

  return (
    <StoryCanvas
      palette={palettes[variant]}
      slide={slide}
    />
  );
}
