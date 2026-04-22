import * as cheerio from "cheerio";

const FOODPRO_BASE_URL = "https://nutrition.sa.ucsc.edu/";
const FOODPRO_COOKIE_HEADER =
  "WebInaCartLocation=; WebInaCartDates=; WebInaCartMeals=; WebInaCartRecipes=; WebInaCartQtys=";
const CACHE_REVALIDATE_SECONDS = 900;
const CACHE_TAG = "ucsc-menus";
const COLLEGE_NINE_LOCATION_ID = "40";

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
    public status: 400 | 404 | 503
  ) {
    super(message);
    this.name = "FoodProError";
  }
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
    name,
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

async function fetchFoodProHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "force-cache",
    headers: {
      Cookie: FOODPRO_COOKIE_HEADER,
      "User-Agent": "SlugSwap menu fetcher",
    },
    next: {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: [CACHE_TAG],
    },
  });

  if (!response.ok) {
    throw new FoodProError(`UCSC menu source returned ${response.status}.`, 503);
  }

  return response.text();
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
  const availableDates = parseAvailableDates($);

  if (!sourceDateLabel || meals.length === 0) {
    throw new FoodProError("Unable to parse UCSC dining menu.", 503);
  }

  return {
    location,
    date: iso,
    sourceDateLabel,
    fetchedAt: new Date().toISOString(),
    availableDates,
    meals,
  };
}

export { COLLEGE_NINE_LOCATION_ID };
