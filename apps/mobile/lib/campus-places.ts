export type CampusPlaceCategory = 'dining' | 'study' | 'essentials';

export type CampusCoordinates = {
  latitude: number;
  longitude: number;
};

export type CampusPlace = {
  id: string;
  name: string;
  shortName: string;
  category: CampusPlaceCategory;
  description: string;
  coordinates: CampusCoordinates;
  systemImage: string;
  diningLocationId?: string;
  libraryId?: 'mchenry' | 'science-engineering';
};

export const CAMPUS_CATEGORY_META: Record<
  CampusPlaceCategory,
  { label: string; singularLabel: string; tintColor: string }
> = {
  dining: {
    label: 'Dining',
    singularLabel: 'Dining hall',
    tintColor: '#183D32',
  },
  study: {
    label: 'Study',
    singularLabel: 'Study space',
    tintColor: '#F4C332',
  },
  essentials: {
    label: 'Essentials',
    singularLabel: 'Campus essential',
    tintColor: '#F06A4F',
  },
};

/**
 * A small, intentionally curated campus index. Dining IDs match the dining-menu
 * API; library IDs match the study-room reservation API. Building coordinates
 * come from UCSC Maps' public facilities layer:
 * https://services3.arcgis.com/21H3muniXm83m5hZ/arcgis/rest/services/facilities_public/FeatureServer/0
 */
export const CAMPUS_PLACES: readonly CampusPlace[] = [
  {
    id: 'dining-cowell-stevenson',
    name: 'Cowell/Stevenson Dining Hall',
    shortName: 'Cowell/Stevenson',
    category: 'dining',
    description: 'Dining hall serving the east side of campus',
    coordinates: { latitude: 36.996813, longitude: -122.053062 },
    systemImage: 'fork.knife',
    diningLocationId: '05',
  },
  {
    id: 'dining-crown-merrill',
    name: 'Crown/Merrill Dining Hall',
    shortName: 'Crown/Merrill',
    category: 'dining',
    description: 'Dining hall near Crown and Merrill colleges',
    coordinates: { latitude: 37.000187, longitude: -122.054438 },
    systemImage: 'fork.knife',
    diningLocationId: '20',
  },
  {
    id: 'dining-college-nine-jrl',
    name: 'College Nine/John R. Lewis Dining Hall',
    shortName: 'College Nine/JRL',
    category: 'dining',
    description: 'Dining hall on the north side of campus',
    coordinates: { latitude: 37.000812, longitude: -122.057812 },
    systemImage: 'fork.knife',
    diningLocationId: '40',
  },
  {
    id: 'dining-porter-kresge',
    name: 'Porter/Kresge Dining Hall',
    shortName: 'Porter/Kresge',
    category: 'dining',
    description: 'Dining hall serving the west side of campus',
    coordinates: { latitude: 36.994187, longitude: -122.065938 },
    systemImage: 'fork.knife',
    diningLocationId: '25',
  },
  {
    id: 'dining-rachel-carson-oakes',
    name: 'Rachel Carson/Oakes Dining Hall',
    shortName: 'Rachel Carson/Oakes',
    category: 'dining',
    description: 'Dining hall near Rachel Carson and Oakes colleges',
    coordinates: { latitude: 36.991563, longitude: -122.065438 },
    systemImage: 'fork.knife',
    diningLocationId: '30',
  },
  {
    id: 'study-mchenry',
    name: 'McHenry Library',
    shortName: 'McHenry Library',
    category: 'study',
    description: 'Library study spaces and reservable rooms',
    coordinates: { latitude: 36.995717, longitude: -122.058912 },
    systemImage: 'book.closed.fill',
    libraryId: 'mchenry',
  },
  {
    id: 'study-science-engineering',
    name: 'Science & Engineering Library',
    shortName: 'Science & Engineering',
    category: 'study',
    description: 'Quiet study spaces and reservable rooms',
    coordinates: { latitude: 36.999125, longitude: -122.060751 },
    systemImage: 'book.closed.fill',
    libraryId: 'science-engineering',
  },
  {
    id: 'essential-bay-tree',
    name: 'Bay Tree Campus Store',
    shortName: 'Bay Tree Store',
    category: 'essentials',
    description: 'Books, supplies, apparel, and everyday essentials',
    coordinates: { latitude: 36.997986, longitude: -122.055493 },
    systemImage: 'bag.fill',
  },
  {
    id: 'essential-health-center',
    name: 'Student Health Center',
    shortName: 'Student Health Center',
    category: 'essentials',
    description: 'Campus health and wellness services',
    coordinates: { latitude: 36.999476, longitude: -122.05758 },
    systemImage: 'cross.case.fill',
  },
  {
    id: 'essential-quarry-plaza',
    name: 'Quarry Plaza',
    shortName: 'Quarry Plaza',
    category: 'essentials',
    description: 'A central stop for student services and transit',
    coordinates: { latitude: 36.99818, longitude: -122.05562 },
    systemImage: 'mappin.and.ellipse',
  },
] as const;

export const DEFAULT_CAMPUS_PLACE_ID = 'dining-porter-kresge';

export function findCampusPlace(id: string | undefined): CampusPlace | null {
  if (!id) return null;
  return CAMPUS_PLACES.find((place) => place.id === id) ?? null;
}

export function filterCampusPlaces(
  category: CampusPlaceCategory,
  query: string,
): CampusPlace[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return CAMPUS_PLACES.filter((place) => {
    if (place.category !== category) return false;
    if (!normalizedQuery) return true;

    return [place.name, place.shortName, place.description]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}
