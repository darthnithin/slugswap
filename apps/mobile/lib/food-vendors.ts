import type { CampusPlace } from './campus-places';
import {
  foodVendorDate,
  foodVendorHours,
  type FoodVendorFeed,
} from '../../../shared/food-vendors';
export * from '../../../shared/food-vendors';

export function foodVendorPlaces(
  feed: FoodVendorFeed | null,
  date = foodVendorDate(),
): CampusPlace[] {
  if (!feed || feed.date !== date) return [];
  return feed.vendors.flatMap((vendor) =>
    vendor.stops.flatMap((stop) =>
      stop.coordinates
        ? [
            {
              id: stop.id,
              name: vendor.name,
              shortName: vendor.name,
              category: 'vendors' as const,
              description: `${stop.locationName} · ${foodVendorHours(stop)} · ${stop.kind === 'check-in' ? 'Checked in today' : 'Regular schedule'}${vendor.acceptsFlexi ? ' · Accepts Flexi' : ''}`,
              coordinates: stop.coordinates,
              systemImage: 'fork.knife',
            },
          ]
        : [],
    ),
  );
}
