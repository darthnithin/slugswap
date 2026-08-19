import type { DiningLocation } from './api';

export function sortDiningLocations(
  locations: DiningLocation[]
): DiningLocation[] {
  return locations
    .map((location, index) => ({ location, index }))
    .sort((left, right) => {
      const closureOrder =
        Number(Boolean(left.location.closed)) -
        Number(Boolean(right.location.closed));
      return closureOrder || left.index - right.index;
    })
    .map(({ location }) => location);
}

export function chooseAvailableLocationId(
  locations: DiningLocation[],
  preferredIds: Array<string | null | undefined>
): string | null {
  for (const preferredId of preferredIds) {
    if (!preferredId) continue;
    const preferred = locations.find((location) => location.id === preferredId);
    if (preferred && !preferred.closed) return preferred.id;
  }

  return (
    locations.find((location) => !location.closed)?.id ??
    preferredIds.find((id): id is string => Boolean(id)) ??
    locations[0]?.id ??
    null
  );
}
