export const FOOD_VENDORS_SOURCE_URL =
  'https://financial.ucsc.edu/Pages/Food_Trucks.aspx';

export type FoodVendorStop = {
  id: string;
  locationId: string;
  locationName: string;
  coordinates: { latitude: number; longitude: number } | null;
  startsAt: string | null;
  endsAt: string | null;
  kind: 'check-in' | 'recurring';
};

export type FoodVendor = {
  id: string;
  name: string;
  cuisine: string | null;
  acceptsFlexi: boolean;
  stops: FoodVendorStop[];
};

export type FoodVendorFeed = {
  date: string;
  fetchedAt: string;
  vendors: FoodVendor[];
};

const pacificDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function foodVendorDate(now = new Date()): string {
  const parts = pacificDate.formatToParts(now);
  return ['year', 'month', 'day']
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join('-');
}

export function foodVendorHours(stop: FoodVendorStop): string {
  if (stop.startsAt && stop.endsAt) return `${stop.startsAt}–${stop.endsAt}`;
  return stop.startsAt
    ? `From ${stop.startsAt}`
    : stop.endsAt
      ? `Until ${stop.endsAt}`
      : 'Hours not listed';
}

export function isFoodVendorFeed(value: unknown): value is FoodVendorFeed {
  if (!value || typeof value !== 'object') return false;
  const feed = value as FoodVendorFeed;
  return (
    typeof feed.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(feed.date) &&
    Number.isFinite(Date.parse(feed.fetchedAt)) &&
    Array.isArray(feed.vendors) &&
    feed.vendors.every((vendor) => {
      if (!vendor || typeof vendor !== 'object') return false;
      return (
        typeof vendor.id === 'string' &&
        typeof vendor.name === 'string' &&
        (vendor.cuisine === null || typeof vendor.cuisine === 'string') &&
        typeof vendor.acceptsFlexi === 'boolean' &&
        Array.isArray(vendor.stops) &&
        vendor.stops.every((stop) => {
          if (!stop || typeof stop !== 'object') return false;
          const point = stop.coordinates;
          const validPoint =
            point === null ||
            (point &&
              Number.isFinite(point.latitude) &&
              Math.abs(point.latitude) <= 90 &&
              Number.isFinite(point.longitude) &&
              Math.abs(point.longitude) <= 180);
          return (
            typeof stop.id === 'string' &&
            typeof stop.locationId === 'string' &&
            typeof stop.locationName === 'string' &&
            (stop.kind === 'check-in' || stop.kind === 'recurring') &&
            (stop.startsAt === null || typeof stop.startsAt === 'string') &&
            (stop.endsAt === null || typeof stop.endsAt === 'string') &&
            Boolean(validPoint)
          );
        })
      );
    })
  );
}
