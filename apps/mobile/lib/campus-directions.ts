import type { CampusPlace } from './campus-places';

type CampusDestination = Pick<CampusPlace, 'name' | 'coordinates'>;

function coordinatePair(destination: CampusDestination): string {
  const { latitude, longitude } = destination.coordinates;
  return `${latitude},${longitude}`;
}

/**
 * Safe fallback for app binaries that predate the native CampusMaps module.
 * Apple documents `q` as a custom pin label when it accompanies `ll`.
 */
export function buildAppleMapsPlaceUrl(destination: CampusDestination): string {
  return `https://maps.apple.com/?ll=${coordinatePair(destination)}&q=${encodeURIComponent(destination.name)}`;
}

export function buildGoogleMapsDirectionsUrl(destination: CampusDestination): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${coordinatePair(destination)}`;
}
