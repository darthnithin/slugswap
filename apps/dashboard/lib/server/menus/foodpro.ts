import * as cheerio from "cheerio";
import { rootCertificates } from "node:tls";
import { Agent } from "undici";
import {
  resolveDiningSchedule,
  type DiningServiceSchedule,
} from "@/lib/server/menus/schedule";

const FOODPRO_BASE_URL = "https://nutrition.sa.ucsc.edu/";
const FOODPRO_ORIGIN = new URL(FOODPRO_BASE_URL).origin;
const FOODPRO_COOKIE_HEADER =
  "WebInaCartLocation=; WebInaCartDates=; WebInaCartMeals=; WebInaCartRecipes=; WebInaCartQtys=";
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
const CACHE_REVALIDATE_SECONDS = 1800;
const CACHE_TAG = "ucsc-menus";
const COLLEGE_NINE_LOCATION_ID = "40";
const FOODPRO_REQUEST_TIMEOUT_MS = 10_000;
const FOODPRO_CERTIFICATE_ERROR_CODES = new Set([
  "CERT_UNTRUSTED",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

// UCSC currently serves an unrelated RSA intermediate after an ECC leaf certificate.
// This is the leaf's actual issuer, pinned from its AIA record. It expires in 2035.
// SHA-256: 22:7B:61:E5:3F:13:1C:EF:CB:81:E8:89:9E:D9:82:9F:7E:78:05:86:64:7F:3F:98:DF:2A:BE:C2:16:7F:40:5B
const FOODPRO_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIDNjCCArygAwIBAgIQOHk0l89NJv2948rV3tVF/zAKBggqhkjOPQQDAzBfMQsw
CQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQDEy1T
ZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBFNDYwHhcN
MjUxMTA2MDAwMDAwWhcNMzUxMTA1MjM1OTU5WjBIMQswCQYDVQQGEwJVUzEWMBQG
A1UEChMNSW5Db21tb24sIExMQzEhMB8GA1UEAxMYSW5Db21tb24gRUNDIE9WIFNT
TCBDQSAzMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEI+ejNeQ1LxNI1+tUq8zJ
qYGVjJtq0ehfh/urxTAnMdocLMkAYGW4bc3hUgnDq2P2bpAnt8kvEHsSms9+eZ9C
NKOCAW8wggFrMB8GA1UdIwQYMBaAFNEi2kxZ8UtfJjiqndbu6w3D+6lhMB0GA1Ud
DgQWBBTOcO80VCw+mDhxIld7K0RZkFG+GTAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0T
AQH/BAgwBgEB/wIBADATBgNVHSUEDDAKBggrBgEFBQcDATATBgNVHSAEDDAKMAgG
BmeBDAECAjBUBgNVHR8ETTBLMEmgR6BFhkNodHRwOi8vY3JsLnNlY3RpZ28uY29t
L1NlY3RpZ29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RFNDYuY3JsMIGE
BggrBgEFBQcBAQR4MHYwTwYIKwYBBQUHMAKGQ2h0dHA6Ly9jcnQuc2VjdGlnby5j
b20vU2VjdGlnb1B1YmxpY1NlcnZlckF1dGhlbnRpY2F0aW9uUm9vdEU0Ni5wN2Mw
IwYIKwYBBQUHMAGGF2h0dHA6Ly9vY3NwLnNlY3RpZ28uY29tMAoGCCqGSM49BAMD
A2gAMGUCMQCgENV+enAFTkpPIXg6u7yCsAq+bkjiJvBsVonfnqY0hVAftb8D39Bt
5Wf8NlBZRF4CMF/znj8ZRYNUgxY2o0/nzEiJ3hJBuYuUmfpbYc5BcBsy+vItNAQ7
mHOhDI5rvYg6LA==
-----END CERTIFICATE-----`;

let foodProCertificateDispatcher: Agent | null = null;

export type DiningLocation = {
  id: string;
  slug: string;
  name: string;
};

export type DiningMenu = {
  location: DiningLocation;
  date: string;
  sourceDateLabel: string;
  fetchedAt: string;
  availableDates: Array<{ date: string; label: string }>;
  recommendedPublishedMealId: string | null;
  serviceSchedule: DiningServiceSchedule;
  meals: Array<{
    id: string;
    name: string;
    sections: Array<{
      name: string;
      items: Array<{ name: string }>;
    }>;
  }>;
};

export class FoodProError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 503,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "FoodProError";
  }
}

export type FoodProErrorDiagnostic = {
  name: string;
  message: string;
  code?: string;
};

export function describeFoodProError(error: unknown): FoodProErrorDiagnostic[] {
  const diagnostics: FoodProErrorDiagnostic[] = [];
  const seen = new Set<Error>();
  let current = error;

  while (current instanceof Error && diagnostics.length < 4 && !seen.has(current)) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    diagnostics.push({
      name: current.name,
      message: current.message,
      ...(typeof code === "string" ? { code } : {}),
    });
    current = current.cause;
  }

  return diagnostics;
}

export function isFoodProCertificateError(error: unknown): boolean {
  const seen = new Set<Error>();
  let current = error;

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && FOODPRO_CERTIFICATE_ERROR_CODES.has(code)) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

function getFoodProCertificateDispatcher(): Agent {
  foodProCertificateDispatcher ??= new Agent({
    connect: {
      ca: [...rootCertificates, FOODPRO_INTERMEDIATE_CA],
    },
  });
  return foodProCertificateDispatcher;
}

const LOCATION_SLUGS: Record<string, string> = {
  "05": "cowell-stevenson",
  "20": "crown-merrill",
  "21": "banana-joes",
  "22": "perk-coffee-bar",
  "23": "oakes-cafe",
  "24": "owls-nest-cafe",
  "25": "porter-kresge",
  "26": "stevenson-coffee-house",
  "30": "rachel-carson-oakes",
  "40": "college-nine",
  "45": "ucen-coffee-bar-bistro",
  "46": "global-village-cafe",
  "47": "merrill-market",
  "50": "porter-market",
};

const LOCATION_LABELS: Record<string, string> = {
  "05": "Cowell/Stevenson",
  "20": "Crown/Merrill",
  "21": "Banana Joe's",
  "22": "Perk Coffee Bar",
  "23": "Oakes Cafe",
  "24": "Owl's Nest",
  "25": "Porter/Kresge",
  "26": "Stevenson Coffee House",
  "30": "RCC/Oakes",
  "40": "College 9/JRL",
  "45": "UCEN Bistro",
  "46": "Global Village Cafe",
  "47": "Merrill Market",
  "50": "Porter Market",
};

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

function toLocation(id: string, name: string): DiningLocation {
  return {
    id,
    slug: LOCATION_SLUGS[id] ?? slugify(name),
    name: LOCATION_LABELS[id] ?? name,
  };
}

function parseDateInput(date: string): { iso: string; foodPro: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new FoodProError("Invalid date. Use YYYY-MM-DD.", 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new FoodProError("Invalid date. Use a real calendar date.", 400);
  }

  return {
    iso: `${match[1]}-${match[2]}-${match[3]}`,
    foodPro: `${month}/${day}/${year}`,
  };
}

function todayInPacific(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function assertDateIsNotPast(date: string) {
  if (date < todayInPacific()) {
    throw new FoodProError("Past dining menus are not available.", 400);
  }
}

function parseFoodProDate(value: string | null): string | null {
  if (!value) return null;

  const parsed = new URL(value, FOODPRO_BASE_URL);
  const dtdate = parsed.searchParams.get("dtdate");
  if (!dtdate) return null;

  const parts = dtdate.split("/");
  if (parts.length !== 3) return null;

  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function mealIdForName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized === "late-night") return "late-night";
  return normalized;
}

function sectionNameFromCategory(value: string): string {
  return normalizeText(value).replace(/^--\s*/, "").replace(/\s*--$/, "");
}

type FoodProFetchInit = RequestInit & {
  dispatcher?: Agent;
  next: {
    revalidate: number;
    tags: string[];
  };
};

async function fetchFoodProResponse(
  url: string,
  init: FoodProFetchInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (
      new URL(url).origin !== FOODPRO_ORIGIN ||
      !isFoodProCertificateError(error)
    ) {
      throw error;
    }

    const retryInit: FoodProFetchInit = {
      ...init,
      dispatcher: getFoodProCertificateDispatcher(),
    };
    return fetch(url, retryInit);
  }
}

async function fetchFoodProHtml(url: string): Promise<string> {
  try {
    const response = await fetchFoodProResponse(url, {
      cache: "force-cache",
      headers: {
        Cookie: FOODPRO_COOKIE_HEADER,
        "User-Agent": USER_AGENT,
      },
      next: {
        revalidate: CACHE_REVALIDATE_SECONDS,
        tags: [CACHE_TAG],
      },
      signal: AbortSignal.timeout(FOODPRO_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new FoodProError(`UCSC menu source returned ${response.status}.`, 503);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof FoodProError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new FoodProError("UCSC menu source timed out.", 503, { cause: error });
    }
    throw new FoodProError("Unable to reach the UCSC menu source.", 503, {
      cause: error,
    });
  }
}

export async function getDiningLocations(): Promise<DiningLocation[]> {
  const html = await fetchFoodProHtml(FOODPRO_BASE_URL);
  const $ = cheerio.load(html);
  const locations: DiningLocation[] = [];
  const seenIds = new Set<string>();

  $("#locationchoices a[href*='locationNum=']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const parsed = new URL(href, FOODPRO_BASE_URL);
    const id = parsed.searchParams.get("locationNum");
    const name = normalizeText($(element).text());
    if (!id || !name || seenIds.has(id)) return;

    seenIds.add(id);
    locations.push(toLocation(id, name));
  });

  if (locations.length === 0) {
    throw new FoodProError("Unable to parse UCSC dining locations.", 503);
  }

  return locations;
}

function buildShortMenuUrl(location: DiningLocation, date: string): string {
  const { foodPro } = parseDateInput(date);
  const params = new URLSearchParams({
    sName: "UC Santa Cruz Dining",
    locationNum: location.id,
    locationName: location.name,
    naFlag: "1",
    WeeksMenus: "UCSC - This Week's Menus",
    myaction: "read",
    dtdate: foodPro,
  });

  return new URL(`shortmenu.aspx?${params.toString()}`, FOODPRO_BASE_URL).toString();
}

function parseAvailableDates($: cheerio.CheerioAPI): Array<{ date: string; label: string }> {
  const dates: Array<{ date: string; label: string }> = [];
  const seenDates = new Set<string>();

  $("select option").each((_, element) => {
    const date = parseFoodProDate($(element).attr("value") ?? null);
    const label = normalizeText($(element).text());
    if (!date || !label || seenDates.has(date)) return;

    seenDates.add(date);
    dates.push({ date, label });
  });

  return dates;
}

function parseMeals($: cheerio.CheerioAPI): DiningMenu["meals"] {
  const meals: DiningMenu["meals"] = [];
  let currentMeal: DiningMenu["meals"][number] | null = null;
  let currentSection: DiningMenu["meals"][number]["sections"][number] | null = null;

  $(".shortmenumeals, .shortmenucats, .shortmenurecipes").each((_, element) => {
    const node = $(element);

    if (node.hasClass("shortmenumeals")) {
      const name = normalizeText(node.text());
      if (!name) return;

      currentMeal = {
        id: mealIdForName(name),
        name,
        sections: [],
      };
      currentSection = null;
      meals.push(currentMeal);
      return;
    }

    if (!currentMeal) return;

    if (node.hasClass("shortmenucats")) {
      const name = sectionNameFromCategory(node.text());
      if (!name) return;

      currentSection = {
        name,
        items: [],
      };
      currentMeal.sections.push(currentSection);
      return;
    }

    if (node.hasClass("shortmenurecipes")) {
      const name = normalizeText(node.text());
      if (!name) return;

      if (!currentSection) {
        currentSection = {
          name: "Items",
          items: [],
        };
        currentMeal.sections.push(currentSection);
      }

      currentSection.items.push({ name });
    }
  });

  return meals
    .map((meal) => ({
      ...meal,
      sections: meal.sections.filter((section) => section.items.length > 0),
    }))
    .filter((meal) => meal.sections.length > 0);
}

export async function getDiningMenu(input: {
  locationId: string;
  date: string;
}): Promise<DiningMenu> {
  const { iso } = parseDateInput(input.date);
  assertDateIsNotPast(iso);
  const locationId = input.locationId.trim();
  if (!locationId) {
    throw new FoodProError("Missing locationId.", 400);
  }

  const locations = await getDiningLocations();
  const location = locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    throw new FoodProError("Unknown dining location.", 404);
  }

  const html = await fetchFoodProHtml(buildShortMenuUrl(location, iso));
  const $ = cheerio.load(html);
  const sourceDateLabel = normalizeText($(".shortmenutitle").first().text());
  const meals = parseMeals($);
  const today = todayInPacific();
  const availableDates = parseAvailableDates($).filter(
    (dateOption) => dateOption.date >= today
  );

  if (!sourceDateLabel || meals.length === 0) {
    throw new FoodProError("Unable to parse UCSC dining menu.", 503);
  }

  const { serviceSchedule, recommendedPublishedMealId } = await resolveDiningSchedule({
    locationId,
    date: iso,
    meals: meals.map((meal) => ({ id: meal.id, name: meal.name })),
  });

  return {
    location,
    date: iso,
    sourceDateLabel,
    fetchedAt: new Date().toISOString(),
    availableDates,
    recommendedPublishedMealId,
    serviceSchedule,
    meals,
  };
}

export { COLLEGE_NINE_LOCATION_ID };
