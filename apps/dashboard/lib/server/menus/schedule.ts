import * as cheerio from "cheerio";
import { existsSync, readFileSync } from "fs";
import path from "path";

type PublishedMeal = {
  id: string;
  name: string;
};

export type DiningServicePeriod = {
  id: string;
  label: string;
  startMinutes: number;
  endMinutes: number;
  mappedPublishedMealIds: string[];
};

export type DiningServiceSchedule = {
  source: "regular" | "special-override" | "official-live" | "unavailable";
  closed: boolean;
  periods: DiningServicePeriod[];
  activePeriodId: string | null;
  currentStatusLabel: string | null;
  note: string | null;
  specialHours: {
    opensAt: string | null;
    closesAt: string | null;
  } | null;
};

type ScheduleRule = {
  weekdays: number[];
  periods: DiningServicePeriod[];
};

type ConfiguredLocation = {
  locationId: string;
  mbhiLocationName: string;
  hoursPageSlug: string;
};

type SpecialHoursOverride = {
  opensAt: string | null;
  closesAt: string | null;
};

const HOURS_DOC_CANDIDATES = [
  path.resolve(process.cwd(), "Hours.md"),
  path.resolve(process.cwd(), "..", "Hours.md"),
  path.resolve(process.cwd(), "..", "..", "Hours.md"),
];
const MBHI_ENDPOINT = "https://dining.wordpress.ucsc.edu/wp-admin/admin-ajax.php";
const DINING_HOURS_BASE_URL = "https://dining.ucsc.edu/locations-hours/";
const MBHI_ACTION = "mb-bhipro-fetch-shortcode";
const MBHI_CACHE_REVALIDATE_SECONDS = 1800;
const MBHI_CACHE_TAG = "ucsc-menu-schedules";
const MBHI_REQUEST_TIMEOUT_MS = 10_000;

const SCHEDULED_LOCATIONS: Record<string, ConfiguredLocation> = {
  "nine-jrl": {
    locationId: "40",
    mbhiLocationName: "College Nine⁄JRL Dining Hall",
    hoursPageSlug: "nine-jrl",
  },
  "cowell-stevenson": {
    locationId: "05",
    mbhiLocationName: "Cowell/Stevenson Dining Hall",
    hoursPageSlug: "cowell-stevenson",
  },
  "crown-merril": {
    locationId: "20",
    mbhiLocationName: "Crown⁄Merrill Dining Hall",
    hoursPageSlug: "crown-merrill",
  },
  "crown-merrill": {
    locationId: "20",
    mbhiLocationName: "Crown⁄Merrill Dining Hall",
    hoursPageSlug: "crown-merrill",
  },
  "porter-kresge": {
    locationId: "25",
    mbhiLocationName: "Porter ⁄ Kresge Dining Hall",
    hoursPageSlug: "porter-kresge",
  },
  "rcc-oakes": {
    locationId: "30",
    mbhiLocationName: "Rachel Carson⁄Oakes Dining Hall",
    hoursPageSlug: "rcc-oakes",
  },
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

let cachedHoursText: string | null = null;

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPeriodId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function resolveHoursDocPath(): string {
  const match = HOURS_DOC_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error("Hours.md could not be found.");
  }
  return match;
}

function readHoursDoc(): string {
  if (cachedHoursText) return cachedHoursText;
  cachedHoursText = readFileSync(resolveHoursDocPath(), "utf8");
  return cachedHoursText;
}

function parseWeekdayRange(value: string): number[] {
  const cleaned = normalizeText(value).toLowerCase();
  const [startRaw, endRaw] = cleaned.split(/\s*[-–]\s*/);
  const start = WEEKDAY_INDEX[startRaw];
  const end = WEEKDAY_INDEX[endRaw ?? startRaw];

  if (start === undefined || end === undefined) {
    throw new Error(`Unsupported weekday range: ${value}`);
  }

  if (start <= end) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  return [
    ...Array.from({ length: 7 - start }, (_, index) => start + index),
    ...Array.from({ length: end + 1 }, (_, index) => index),
  ];
}

function parseTime(value: string, fallbackMeridiem?: "AM" | "PM"): number {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(normalizeText(value));
  if (!match) {
    throw new Error(`Unsupported time value: ${value}`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = (match[3]?.toUpperCase() ?? fallbackMeridiem) as "AM" | "PM" | undefined;

  if (!meridiem) {
    throw new Error(`Missing AM/PM value for time: ${value}`);
  }

  const baseHour = hour % 12;
  const normalizedHour = meridiem === "PM" ? baseHour + 12 : baseHour;
  return normalizedHour * 60 + minute;
}

function parseRange(range: string): { startMinutes: number; endMinutes: number } {
  const cleaned = normalizeText(range)
    .replace(/\(.*?\)/g, "")
    .replace(/\*/g, "")
    .trim();
  const [startRaw, endRaw] = cleaned.split(/\s*[-–]\s*/);
  if (!startRaw || !endRaw) {
    throw new Error(`Unsupported time range: ${range}`);
  }

  const endMatch = /(AM|PM)$/i.exec(endRaw);
  const fallbackMeridiem = endMatch?.[1]?.toUpperCase() as "AM" | "PM" | undefined;
  const startMinutes = parseTime(startRaw, fallbackMeridiem);
  const endMinutes = parseTime(endRaw, fallbackMeridiem);

  return { startMinutes, endMinutes };
}

function mapPeriodToPublishedMeals(periodId: string): string[] {
  switch (periodId) {
    case "breakfast":
      return ["breakfast"];
    case "continuous-dining":
      return ["lunch"];
    case "brunch":
      return ["lunch"];
    case "lunch":
      return ["lunch"];
    case "dinner":
      return ["dinner"];
    case "late-night":
      return ["late-night"];
    default:
      return [periodId];
  }
}

function parseHoursRules(): Record<string, ScheduleRule[]> {
  const text = readHoursDoc();
  const lines = text.split(/\r?\n/);
  const rulesBySlug: Record<string, ScheduleRule[]> = {};
  let currentSlug: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = normalizeText(lines[index] ?? "");
    index += 1;
    if (!line) continue;
    if (line.startsWith("*")) continue;

    const headerMatch = /^([^:]+):$/.exec(line);
    if (headerMatch) {
      currentSlug = slugify(headerMatch[1]);
      rulesBySlug[currentSlug] = [];
      continue;
    }

    if (!currentSlug) continue;

    if (!line.includes(":")) {
      const weekdays = parseWeekdayRange(line);
      const periods: DiningServicePeriod[] = [];

      while (index < lines.length && !normalizeText(lines[index] ?? "")) {
        index += 1;
      }

      while (index < lines.length) {
        const candidate = normalizeText(lines[index] ?? "");
        if (!candidate) {
          index += 1;
          break;
        }
        if (!candidate.includes(":")) {
          break;
        }

        const separatorIndex = candidate.indexOf(":");
        const label = normalizeText(candidate.slice(0, separatorIndex));
        const rangeRaw = candidate.slice(separatorIndex + 1).trim();
        const periodId = toPeriodId(label);
        const { startMinutes, endMinutes } = parseRange(rangeRaw);

        periods.push({
          id: periodId,
          label,
          startMinutes,
          endMinutes,
          mappedPublishedMealIds: mapPeriodToPublishedMeals(periodId),
        });
        index += 1;
      }

      if (periods.length > 0) {
        rulesBySlug[currentSlug].push({ weekdays, periods });
      }
    }
  }

  return rulesBySlug;
}

function getConfiguredLocation(locationId: string): ConfiguredLocation | null {
  const rules = parseHoursRules();

  for (const [slug, config] of Object.entries(SCHEDULED_LOCATIONS)) {
    if (config.locationId === locationId && rules[slug]?.length) {
      return config;
    }
  }

  return null;
}

function getPeriodsForDate(locationId: string, date: string): DiningServicePeriod[] {
  const rules = parseHoursRules();
  const configured = Object.entries(SCHEDULED_LOCATIONS).find(
    ([slug, config]) => config.locationId === locationId && rules[slug]?.length
  );
  if (!configured) return [];

  const [slug] = configured;
  const weekday = new Date(`${date}T12:00:00-07:00`).getDay();
  const match = rules[slug].find((rule) => rule.weekdays.includes(weekday));
  return match?.periods ?? [];
}

function parseTimeStringToMinutes(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw ?? "0");
  return hours * 60 + minutes;
}

function formatMinutes(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  if (mins === 0) return `${hours12} ${meridiem}`;
  return `${hours12}:${mins.toString().padStart(2, "0")} ${meridiem}`;
}

function currentPacificMinutes(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function todayInPacific(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function buildMbhiOptions(locationName: string, code: "mbhi_specials" | "mbhi_vacations") {
  const rawOptions = `location="${locationName}" format="12" output="table"`;
  return buildMbhiRequestUrl(rawOptions, code);
}

function buildMbhiRequestUrl(rawOptions: string, code: string): string {
  const encodedOptions = Buffer.from(rawOptions, "utf8").toString("base64");
  const url = new URL(MBHI_ENDPOINT);
  url.searchParams.set("action", MBHI_ACTION);
  url.searchParams.set("code", code);
  url.searchParams.set("options", encodedOptions);
  return url.toString();
}

async function fetchMbhiHtml(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      headers: {
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "user-agent": "SlugSwap Menu Schedule Fetcher",
      },
      next: {
        revalidate: MBHI_CACHE_REVALIDATE_SECONDS,
        tags: [MBHI_CACHE_TAG],
      },
      signal: AbortSignal.timeout(MBHI_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`MBHI returned ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new Error("MBHI schedule source timed out");
    }
    throw error;
  }
}

async function fetchDiningHoursPage(slug: string): Promise<string> {
  const url = new URL(`${slug}/`, DINING_HOURS_BASE_URL).toString();
  const response = await fetch(url, {
    cache: "force-cache",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "SlugSwap Menu Schedule Fetcher",
    },
    next: {
      revalidate: MBHI_CACHE_REVALIDATE_SECONDS,
      tags: [MBHI_CACHE_TAG],
    },
    signal: AbortSignal.timeout(MBHI_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`UCSC dining hours page returned ${response.status}`);
  }

  return response.text();
}

export function parseActiveMbhiOptions(html: string): string | null {
  const $ = cheerio.load(html);
  const encoded = $("[data-fetch-shortcode][data-code='mbhi']")
    .first()
    .attr("data-arguments");
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
    return /\blocation="[^"]+"/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseOfficialCurrentStatus(
  html: string
): { closed: boolean; label: string } | null {
  const $ = cheerio.load(html);
  const status = $(".mb-bhi-display").first();
  if (!status.length) return null;

  const isClosed = status.hasClass("mb-bhi-closed");
  const isOpen = status.hasClass("mb-bhi-open");
  if (!isClosed && !isOpen) return null;

  return {
    closed: isClosed,
    label: isClosed ? "Currently closed" : "Currently open",
  };
}

async function getOfficialCurrentStatus(
  configured: ConfiguredLocation
): Promise<{ closed: boolean; label: string } | null> {
  const pageHtml = await fetchDiningHoursPage(configured.hoursPageSlug);
  const activeOptions = parseActiveMbhiOptions(pageHtml);
  if (!activeOptions) return null;

  const statusHtml = await fetchMbhiHtml(buildMbhiRequestUrl(activeOptions, "mbhi"));
  return parseOfficialCurrentStatus(statusHtml);
}

function parseSpecialEntries(html: string): Record<string, SpecialHoursOverride> {
  const $ = cheerio.load(html);
  const entries: Record<string, SpecialHoursOverride> = {};

  $("[itemprop='openingHoursSpecification']").each((_, element) => {
    const node = $(element);
    const validFrom = node.find("time[itemprop='validFrom validThrough']").attr("datetime");
    if (!validFrom) return;

    entries[validFrom] = {
      opensAt: node.find("time[itemprop='opens']").attr("datetime")?.slice(0, 5) ?? null,
      closesAt: node.find("time[itemprop='closes']").attr("datetime")?.slice(0, 5) ?? null,
    };
  });

  return entries;
}

async function getSpecialHoursOverride(
  locationId: string,
  date: string
): Promise<SpecialHoursOverride | null> {
  const configured = getConfiguredLocation(locationId);
  if (!configured) return null;

  const [specialsHtml, vacationsHtml] = await Promise.all([
    fetchMbhiHtml(buildMbhiOptions(configured.mbhiLocationName, "mbhi_specials")),
    fetchMbhiHtml(buildMbhiOptions(configured.mbhiLocationName, "mbhi_vacations")),
  ]);

  const vacationEntries = parseSpecialEntries(vacationsHtml);
  const specialEntries = parseSpecialEntries(specialsHtml);
  return vacationEntries[date] ?? specialEntries[date] ?? null;
}

function chooseMealFromPeriod(
  period: DiningServicePeriod | null,
  meals: PublishedMeal[]
): string | null {
  if (!period) return null;
  for (const mealId of period.mappedPublishedMealIds) {
    if (meals.some((meal) => meal.id === mealId)) {
      return mealId;
    }
  }
  return null;
}

function fallbackMealId(meals: PublishedMeal[]): string | null {
  return meals[0]?.id ?? null;
}

function buildRegularSchedule(
  date: string,
  periods: DiningServicePeriod[],
  meals: PublishedMeal[]
): {
  serviceSchedule: DiningServiceSchedule;
  recommendedPublishedMealId: string | null;
} {
  const isToday = date === todayInPacific();
  const nowMinutes = isToday ? currentPacificMinutes() : null;
  const activePeriod =
    nowMinutes == null
      ? null
      : periods.find((period) => nowMinutes >= period.startMinutes && nowMinutes < period.endMinutes) ??
        null;
  const nextPeriod =
    nowMinutes == null ? null : periods.find((period) => nowMinutes < period.startMinutes) ?? null;

  const recommendedPublishedMealId =
    chooseMealFromPeriod(activePeriod, meals) ??
    chooseMealFromPeriod(nextPeriod, meals) ??
    periods.map((period) => chooseMealFromPeriod(period, meals)).find(Boolean) ??
    fallbackMealId(meals);

  let currentStatusLabel: string | null = null;
  if (isToday) {
    if (activePeriod) {
      currentStatusLabel = `Currently serving ${activePeriod.label} until ${formatMinutes(
        activePeriod.endMinutes
      )}`;
    } else if (nextPeriod) {
      currentStatusLabel = `${nextPeriod.label} starts at ${formatMinutes(nextPeriod.startMinutes)}`;
    } else {
      currentStatusLabel = "Closed for the day";
    }
  }

  return {
    serviceSchedule: {
      source: "regular",
      closed: periods.length === 0,
      periods,
      activePeriodId: activePeriod?.id ?? null,
      currentStatusLabel,
      note: null,
      specialHours: null,
    },
    recommendedPublishedMealId,
  };
}

function buildSpecialOverrideSchedule(
  date: string,
  override: SpecialHoursOverride,
  meals: PublishedMeal[]
): {
  serviceSchedule: DiningServiceSchedule;
  recommendedPublishedMealId: string | null;
} {
  const isToday = date === todayInPacific();
  const nowMinutes = isToday ? currentPacificMinutes() : null;
  const opensMinutes =
    override.opensAt != null ? parseTimeStringToMinutes(override.opensAt) : null;
  const closesMinutes =
    override.closesAt != null ? parseTimeStringToMinutes(override.closesAt) : null;
  const isOpenNow =
    nowMinutes != null &&
    opensMinutes != null &&
    closesMinutes != null &&
    nowMinutes >= opensMinutes &&
    nowMinutes < closesMinutes;

  let currentStatusLabel: string | null = null;
  if (isToday) {
    if (opensMinutes == null || closesMinutes == null) {
      currentStatusLabel = "Closed today for special hours";
    } else if (isOpenNow) {
      currentStatusLabel = `Open now with special hours until ${formatMinutes(closesMinutes)}`;
    } else if (nowMinutes != null && nowMinutes < opensMinutes) {
      currentStatusLabel = `Special hours today: opens at ${formatMinutes(opensMinutes)}`;
    } else {
      currentStatusLabel = "Closed now for special hours";
    }
  }

  return {
    serviceSchedule: {
      source: "special-override",
      closed: opensMinutes == null || closesMinutes == null,
      periods: [],
      activePeriodId: null,
      currentStatusLabel,
      note:
        "Special hours are in effect for this date, so meal-period mapping is unavailable. Showing the published FoodPro menu.",
      specialHours: override,
    },
    recommendedPublishedMealId: fallbackMealId(meals),
  };
}

function buildUnavailableSchedule(meals: PublishedMeal[]): {
  serviceSchedule: DiningServiceSchedule;
  recommendedPublishedMealId: string | null;
} {
  return {
    serviceSchedule: {
      source: "unavailable",
      closed: false,
      periods: [],
      activePeriodId: null,
      currentStatusLabel: null,
      note:
        "A meal-period schedule is not configured for this location yet. Showing the published FoodPro menu.",
      specialHours: null,
    },
    recommendedPublishedMealId: fallbackMealId(meals),
  };
}

async function buildUnpublishedMenuSchedule(
  configured: ConfiguredLocation | null,
  date: string
): Promise<{
  serviceSchedule: DiningServiceSchedule;
  recommendedPublishedMealId: null;
}> {
  const isToday = date === todayInPacific();
  let officialStatus: { closed: boolean; label: string } | null = null;

  if (isToday && configured) {
    try {
      officialStatus = await getOfficialCurrentStatus(configured);
    } catch (error) {
      console.warn(
        `Unable to load the live UCSC dining status for location ${configured.locationId}:`,
        error
      );
    }
  }

  const currentStatusLabel = officialStatus
    ? officialStatus.closed
      ? "Currently closed"
      : "Currently open, but no menu is published"
    : isToday
      ? "No menu is published today"
      : "No menu is published for this date";

  return {
    serviceSchedule: {
      source: officialStatus ? "official-live" : "unavailable",
      closed: officialStatus?.closed ?? false,
      periods: [],
      activePeriodId: null,
      currentStatusLabel,
      note:
        "UCSC FoodPro reports no menu data for this location and date. The location may be closed or its menu may not be published yet.",
      specialHours: null,
    },
    recommendedPublishedMealId: null,
  };
}

export async function resolveDiningSchedule(input: {
  locationId: string;
  date: string;
  meals: PublishedMeal[];
  menuPublished?: boolean;
}): Promise<{
  serviceSchedule: DiningServiceSchedule;
  recommendedPublishedMealId: string | null;
}> {
  const configured = getConfiguredLocation(input.locationId);
  if (input.menuPublished === false) {
    return buildUnpublishedMenuSchedule(configured, input.date);
  }

  if (!configured) {
    return buildUnavailableSchedule(input.meals);
  }

  let specialOverride: SpecialHoursOverride | null = null;
  try {
    specialOverride = await getSpecialHoursOverride(input.locationId, input.date);
  } catch (error) {
    console.warn(
      `Unable to load special dining hours for location ${input.locationId}; using regular schedule:`,
      error
    );
  }
  if (specialOverride) {
    return buildSpecialOverrideSchedule(input.date, specialOverride, input.meals);
  }

  const periods = getPeriodsForDate(input.locationId, input.date);
  if (!periods.length) {
    return buildUnavailableSchedule(input.meals);
  }

  return buildRegularSchedule(input.date, periods, input.meals);
}
