import type { CampusCoordinates } from './campus-places';

const ARCGIS_ROOT =
  'https://services3.arcgis.com/21H3muniXm83m5hZ/arcgis/rest/services';

const FACILITIES_URL = `${ARCGIS_ROOT}/facilities_public/FeatureServer/0`;
const BUS_STOPS_URL = `${ARCGIS_ROOT}/BusStops/FeatureServer/0`;
const BUS_ROUTES_URL = `${ARCGIS_ROOT}/bus_route/FeatureServer/0`;
const PARKING_URL =
  `${ARCGIS_ROOT}/Join_Features_to_Parking_Lots_2_view/FeatureServer/0`;
const CONSTRUCTION_URL =
  `${ARCGIS_ROOT}/Active_Construction_Impacts/FeatureServer/0`;
const RESTROOMS_URL = `${ARCGIS_ROOT}/GenderInclusiveRestrooms/FeatureServer/0`;
const LACTATION_URL =
  `${ARCGIS_ROOT}/buildings_with_lactation_rooms/FeatureServer/16`;
const BIKE_REPAIR_URL = `${ARCGIS_ROOT}/BicycleRepair/FeatureServer/0`;
const EMERGENCY_PHONES_URL = `${ARCGIS_ROOT}/EmergencyPhones/FeatureServer/0`;
const RECREATION_URL = `${ARCGIS_ROOT}/recreation/FeatureServer/1`;
const GARDENS_URL = `${ARCGIS_ROOT}/gardens/FeatureServer/0`;
const POINTS_OF_INTEREST_URL = `${ARCGIS_ROOT}/points_of_interest/FeatureServer/1`;

export type CampusMapLayerId =
  | 'transit'
  | 'parking'
  | 'amenities'
  | 'construction'
  | 'outdoors';

export type CampusMapFeatureKind =
  | 'building'
  | 'transit-stop'
  | 'parking-lot'
  | 'restroom'
  | 'lactation'
  | 'bike-repair'
  | 'emergency-phone'
  | 'construction'
  | 'recreation'
  | 'garden'
  | 'point-of-interest';

export type CampusMapFeature = {
  id: string;
  name: string;
  shortName: string;
  kind: CampusMapFeatureKind;
  layerId?: CampusMapLayerId;
  description: string;
  details: string[];
  coordinates: CampusCoordinates;
  systemImage: string;
};

export type CampusMapPolyline = {
  id: string;
  coordinates: CampusCoordinates[];
};

export type CampusMapPolygon = {
  id: string;
  coordinates: CampusCoordinates[];
};

export type CampusMapLayerData = {
  features: CampusMapFeature[];
  polylines: CampusMapPolyline[];
  polygons: CampusMapPolygon[];
};

export const CAMPUS_MAP_LAYER_META: Record<
  CampusMapLayerId,
  {
    title: string;
    description: string;
    color: string;
    icon: string;
  }
> = {
  transit: {
    title: 'Transit',
    description: 'Campus shuttle and Metro stops and routes',
    color: '#2F6FA3',
    icon: 'bus.fill',
  },
  parking: {
    title: 'Parking',
    description: 'Lots, permits, ParkMobile, and enforcement',
    color: '#7A6043',
    icon: 'parkingsign.circle.fill',
  },
  amenities: {
    title: 'Amenities',
    description: 'Restrooms, lactation, bike repair, and emergency phones',
    color: '#76568A',
    icon: 'mappin.and.ellipse',
  },
  construction: {
    title: 'Construction',
    description: 'Current public-facing campus impacts',
    color: '#F06A4F',
    icon: 'hammer.fill',
  },
  outdoors: {
    title: 'Outdoors',
    description: 'Recreation, gardens, and places of interest',
    color: '#3F7654',
    icon: 'leaf.fill',
  },
};

export const CAMPUS_MAP_LAYER_ORDER: readonly CampusMapLayerId[] = [
  'transit',
  'parking',
  'amenities',
  'construction',
  'outdoors',
];

type ArcGisGeometry = {
  x?: number;
  y?: number;
  paths?: number[][][];
  rings?: number[][][];
};

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: ArcGisGeometry;
  centroid?: { x?: number; y?: number };
};

type ArcGisResponse = {
  features?: ArcGisFeature[];
  error?: { message?: string; details?: string[] };
};

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueText(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function firstLine(value: unknown): string {
  return textValue(value).split(/\r?\n/)[0]?.trim() ?? '';
}

function coordinatesFromFeature(feature: ArcGisFeature): CampusCoordinates | null {
  const attributes = feature.attributes ?? {};
  const longitude =
    numberValue(feature.geometry?.x) ??
    numberValue(feature.centroid?.x) ??
    numberValue(attributes.LONGITUDE);
  const latitude =
    numberValue(feature.geometry?.y) ??
    numberValue(feature.centroid?.y) ??
    numberValue(attributes.LATITUDE);

  if (longitude === null || latitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function arcGisCoordinates(points: number[][] | undefined): CampusCoordinates[] {
  if (!points) return [];
  return points.flatMap(([longitude, latitude]) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ latitude, longitude }];
  });
}

export function escapeArcGisLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

export function buildCampusBuildingSearchUrl(query: string): string | null {
  const normalized = query.trim();
  if (normalized.length < 2) return null;

  const escaped = escapeArcGisLiteral(normalized);
  const fields = ['BUILDINGNAME', 'LABELNAME', 'ALIAS', 'DEPARTMENTS'];
  const matches = fields.map((field) => `${field} LIKE '%${escaped}%'`).join(' OR ');
  const params = new URLSearchParams({
    where: `(HIDE IS NULL OR HIDE = 0) AND (${matches})`,
    outFields:
      'OBJECTID,BUILDINGNAME,LABELNAME,ALIAS,DEPARTMENTS,LONGITUDE,LATITUDE,ADDRESS,PRIMARYUSE',
    returnGeometry: 'false',
    resultRecordCount: '50',
    f: 'json',
  });

  return `${FACILITIES_URL}/query?${params.toString()}`;
}

function buildingScore(feature: CampusMapFeature, query: string): number {
  const normalized = query.trim().toLocaleLowerCase();
  const name = feature.name.toLocaleLowerCase();
  const details = feature.details.join(' ').toLocaleLowerCase();

  if (name === normalized) return 0;
  if (name.startsWith(normalized)) return 1;
  if (name.includes(normalized)) return 2;
  if (details.includes(normalized)) return 3;
  return 4;
}

export function normalizeBuildingFeatures(
  response: ArcGisResponse,
  query: string,
): CampusMapFeature[] {
  return (response.features ?? [])
    .flatMap((feature) => {
      const attributes = feature.attributes ?? {};
      const coordinates = coordinatesFromFeature(feature);
      const objectId = textValue(attributes.OBJECTID);
      const name =
        textValue(attributes.BUILDINGNAME) ||
        textValue(attributes.LABELNAME) ||
        textValue(attributes.ALIAS);

      if (!coordinates || !objectId || !name) return [];

      const address = textValue(attributes.ADDRESS);
      const departments = textValue(attributes.DEPARTMENTS);
      const alias = textValue(attributes.ALIAS);
      const primaryUse = textValue(attributes.PRIMARYUSE).replace(/^[A-Z]+\s*-\s*/, '');
      const details = uniqueText([alias, departments, address, primaryUse]);

      return [
        {
          id: `building-${objectId}`,
          name,
          shortName: name,
          kind: 'building' as const,
          description: address || departments || primaryUse || 'Campus building',
          details,
          coordinates,
          systemImage: 'building.2.fill',
        },
      ];
    })
    .sort((left, right) => {
      const scoreDelta = buildingScore(left, query) - buildingScore(right, query);
      return scoreDelta || left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

async function readArcGisResponse(url: string, signal?: AbortSignal): Promise<ArcGisResponse> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('UCSC Maps could not be reached.');
  }

  if (!response.ok) {
    throw new Error(`UCSC Maps returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ArcGisResponse;
  if (payload.error) {
    const detail = payload.error.details?.find(Boolean);
    throw new Error(detail || payload.error.message || 'UCSC Maps rejected the request.');
  }
  if (!Array.isArray(payload.features)) {
    throw new Error('UCSC Maps returned an unexpected response.');
  }
  return payload;
}

export async function searchCampusBuildings(
  query: string,
  signal?: AbortSignal,
): Promise<CampusMapFeature[]> {
  const url = buildCampusBuildingSearchUrl(query);
  if (!url) return [];
  const response = await readArcGisResponse(url, signal);
  return normalizeBuildingFeatures(response, query);
}

function queryUrl(
  layerUrl: string,
  options: {
    where?: string;
    outFields: string;
    returnCentroid?: boolean;
    resultRecordCount?: number;
    maxAllowableOffset?: number;
  },
): string {
  const params = new URLSearchParams({
    where: options.where ?? '1=1',
    outFields: options.outFields,
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: String(options.resultRecordCount ?? 1000),
    f: 'json',
  });
  if (options.returnCentroid) params.set('returnCentroid', 'true');
  if (options.maxAllowableOffset) {
    params.set('maxAllowableOffset', String(options.maxAllowableOffset));
  }
  return `${layerUrl}/query?${params.toString()}`;
}

function featureId(feature: ArcGisFeature, fields: string[]): string {
  const attributes = feature.attributes ?? {};
  for (const field of fields) {
    const value = textValue(attributes[field]);
    if (value) return value;
  }
  return '';
}

function normalizeTransit(response: ArcGisResponse): CampusMapFeature[] {
  return (response.features ?? []).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const coordinates = coordinatesFromFeature(feature);
    const id = featureId(feature, ['OBJECTID_1', 'stopId']);
    const name = textValue(attributes.NAME);
    const stopType = textValue(attributes.STOPTYPE);
    const stopId = textValue(attributes.stopId);
    if (!coordinates || !id || !name) return [];

    return [
      {
        id: `transit-${id}`,
        name,
        shortName: name,
        kind: 'transit-stop' as const,
        layerId: 'transit' as const,
        description: stopType || 'Campus transit stop',
        details: uniqueText([stopType, stopId ? `Stop ${stopId}` : null]),
        coordinates,
        systemImage: 'bus.fill',
      },
    ];
  });
}

function normalizeParking(response: ArcGisResponse): CampusMapFeature[] {
  return (response.features ?? []).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const coordinates = coordinatesFromFeature(feature);
    const id = featureId(feature, ['ObjectId', 'OBJECTID', 'NUM']);
    const lotNumber = textValue(attributes.NUM) || textValue(attributes.NUMBER);
    const location =
      textValue(attributes.NAME) || textValue(attributes.LOCATION_1757974951504);
    if (!coordinates || !id || (!lotNumber && !location)) return [];

    const name = lotNumber ? `Parking Lot ${lotNumber}` : location;
    const permits =
      textValue(attributes.PERMITS_ACCEPTED) || textValue(attributes.Permit_Type);
    const enforcement = textValue(attributes.ENFORCEMENT);
    const comments = textValue(attributes.NOTES) || textValue(attributes.Comments);
    const hasParkMobile = numberValue(attributes.PARKMOBILE) !== 0;
    const hasAda = numberValue(attributes.ADA) !== 0;
    const details = uniqueText([
      location && location !== name ? location : null,
      permits ? `Permits: ${permits}` : null,
      enforcement ? `Enforcement: ${enforcement}` : null,
      hasParkMobile ? 'ParkMobile available' : null,
      hasAda ? 'Accessible parking available' : null,
      comments,
    ]);

    return [
      {
        id: `parking-${id}`,
        name,
        shortName: name,
        kind: 'parking-lot' as const,
        layerId: 'parking' as const,
        description: location || permits || 'Campus parking',
        details,
        coordinates,
        systemImage: 'parkingsign.circle.fill',
      },
    ];
  });
}

function normalizeConstruction(response: ArcGisResponse): CampusMapFeature[] {
  return (response.features ?? []).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const coordinates = coordinatesFromFeature(feature);
    const id = featureId(feature, ['OBJECTID']);
    const name = textValue(attributes.Project);
    const impact = textValue(attributes.ImpactLevel);
    const description = textValue(attributes.Description);
    if (!coordinates || !id || !name) return [];

    return [
      {
        id: `construction-${id}`,
        name,
        shortName: name,
        kind: 'construction' as const,
        layerId: 'construction' as const,
        description: impact ? `${impact} impact` : 'Active construction impact',
        details: uniqueText([impact ? `${impact} impact` : null, description]),
        coordinates,
        systemImage: 'hammer.fill',
      },
    ];
  });
}

function normalizePointLayer(
  response: ArcGisResponse,
  options: {
    idPrefix: string;
    idFields: string[];
    name: (attributes: Record<string, unknown>) => string;
    description: (attributes: Record<string, unknown>) => string;
    kind: CampusMapFeatureKind;
    layerId: CampusMapLayerId;
    systemImage: string;
  },
): CampusMapFeature[] {
  return (response.features ?? []).flatMap((feature) => {
    const attributes = feature.attributes ?? {};
    const coordinates = coordinatesFromFeature(feature);
    const id = featureId(feature, options.idFields);
    const name = options.name(attributes);
    const description = options.description(attributes);
    if (!coordinates || !id || !name) return [];

    return [
      {
        id: `${options.idPrefix}-${id}`,
        name,
        shortName: name,
        kind: options.kind,
        layerId: options.layerId,
        description,
        details: uniqueText([description]),
        coordinates,
        systemImage: options.systemImage,
      },
    ];
  });
}

function normalizePolylines(response: ArcGisResponse, prefix: string): CampusMapPolyline[] {
  return (response.features ?? []).flatMap((feature) => {
    const id = featureId(feature, ['OBJECTID']);
    return (feature.geometry?.paths ?? []).flatMap((path, index) => {
      const coordinates = arcGisCoordinates(path);
      if (!id || coordinates.length < 2) return [];
      return [{ id: `${prefix}-${id}-${index}`, coordinates }];
    });
  });
}

function normalizePolygons(response: ArcGisResponse, prefix: string): CampusMapPolygon[] {
  return (response.features ?? []).flatMap((feature) => {
    const id = featureId(feature, ['OBJECTID']);
    return (feature.geometry?.rings ?? []).flatMap((ring, index) => {
      const coordinates = arcGisCoordinates(ring);
      if (!id || coordinates.length < 3) return [];
      return [{ id: `${prefix}-${id}-${index}`, coordinates }];
    });
  });
}

export async function fetchCampusMapLayer(
  layerId: CampusMapLayerId,
  signal?: AbortSignal,
): Promise<CampusMapLayerData> {
  if (layerId === 'transit') {
    const [stops, routes] = await Promise.all([
      readArcGisResponse(
        queryUrl(BUS_STOPS_URL, {
          outFields: 'OBJECTID_1,NAME,STOPTYPE,stopId',
        }),
        signal,
      ),
      readArcGisResponse(
        queryUrl(BUS_ROUTES_URL, {
          outFields: 'OBJECTID,Name',
          maxAllowableOffset: 0.00001,
        }),
        signal,
      ),
    ]);
    return {
      features: normalizeTransit(stops),
      polylines: normalizePolylines(routes, 'transit-route'),
      polygons: [],
    };
  }

  if (layerId === 'parking') {
    const response = await readArcGisResponse(
      queryUrl(PARKING_URL, {
        outFields:
          'ObjectId,NUM,NUMBER,NAME,LOCATION_1757974951504,PERMITS_ACCEPTED,Permit_Type,ADA,PARKMOBILE,ENFORCEMENT,NOTES,Comments',
        returnCentroid: true,
      }),
      signal,
    );
    return { features: normalizeParking(response), polylines: [], polygons: [] };
  }

  if (layerId === 'construction') {
    const response = await readArcGisResponse(
      queryUrl(CONSTRUCTION_URL, {
        where: "PublicFacing = 1 AND ImpactStatus = 'Active'",
        outFields: 'OBJECTID,Project,Description,ImpactLevel,ImpactStatus',
        returnCentroid: true,
        maxAllowableOffset: 0.00001,
      }),
      signal,
    );
    return {
      features: normalizeConstruction(response),
      polylines: [],
      polygons: normalizePolygons(response, 'construction-area'),
    };
  }

  if (layerId === 'amenities') {
    const [restrooms, lactation, bikeRepair, emergencyPhones] = await Promise.all([
      readArcGisResponse(
        queryUrl(RESTROOMS_URL, { outFields: 'OID,Name,PopupInfo' }),
        signal,
      ),
      readArcGisResponse(
        queryUrl(LACTATION_URL, {
          outFields: 'OBJECTID,LACTATIONDESCRIPTION,LONGITUDE,LATITUDE',
          returnCentroid: true,
        }),
        signal,
      ),
      readArcGisResponse(
        queryUrl(BIKE_REPAIR_URL, { outFields: 'OBJECTID,amenity,Location' }),
        signal,
      ),
      readArcGisResponse(
        queryUrl(EMERGENCY_PHONES_URL, { outFields: 'OBJECTID,light_id' }),
        signal,
      ),
    ]);

    return {
      features: [
        ...normalizePointLayer(restrooms, {
          idPrefix: 'restroom',
          idFields: ['OID'],
          name: (attributes) => textValue(attributes.Name),
          description: (attributes) =>
            textValue(attributes.PopupInfo) || 'All-gender restroom',
          kind: 'restroom',
          layerId: 'amenities',
          systemImage: 'figure.dress.line.vertical.figure',
        }),
        ...normalizePointLayer(lactation, {
          idPrefix: 'lactation',
          idFields: ['OBJECTID'],
          name: (attributes) => firstLine(attributes.LACTATIONDESCRIPTION),
          description: (attributes) =>
            textValue(attributes.LACTATIONDESCRIPTION).replace(/\r?\n/g, ' · '),
          kind: 'lactation',
          layerId: 'amenities',
          systemImage: 'figure.and.child.holdinghands',
        }),
        ...normalizePointLayer(bikeRepair, {
          idPrefix: 'bike-repair',
          idFields: ['OBJECTID'],
          name: (attributes) => textValue(attributes.Location) || 'Bicycle repair station',
          description: () => 'Bicycle repair station',
          kind: 'bike-repair',
          layerId: 'amenities',
          systemImage: 'wrench.and.screwdriver.fill',
        }),
        ...normalizePointLayer(emergencyPhones, {
          idPrefix: 'emergency-phone',
          idFields: ['OBJECTID'],
          name: () => 'Emergency blue light phone',
          description: () => 'Campus emergency phone',
          kind: 'emergency-phone',
          layerId: 'amenities',
          systemImage: 'phone.fill',
        }),
      ],
      polylines: [],
      polygons: [],
    };
  }

  const [recreation, gardens, pointsOfInterest] = await Promise.all([
    readArcGisResponse(queryUrl(RECREATION_URL, { outFields: 'OBJECTID,Name' }), signal),
    readArcGisResponse(queryUrl(GARDENS_URL, { outFields: 'FID,Name' }), signal),
    readArcGisResponse(
      queryUrl(POINTS_OF_INTEREST_URL, { outFields: 'OBJECTID,Name' }),
      signal,
    ),
  ]);

  return {
    features: [
      ...normalizePointLayer(recreation, {
        idPrefix: 'recreation',
        idFields: ['OBJECTID'],
        name: (attributes) => textValue(attributes.Name),
        description: () => 'Recreation facility',
        kind: 'recreation',
        layerId: 'outdoors',
        systemImage: 'figure.run',
      }),
      ...normalizePointLayer(gardens, {
        idPrefix: 'garden',
        idFields: ['FID'],
        name: (attributes) => textValue(attributes.Name),
        description: () => 'Campus garden',
        kind: 'garden',
        layerId: 'outdoors',
        systemImage: 'leaf.fill',
      }),
      ...normalizePointLayer(pointsOfInterest, {
        idPrefix: 'point-of-interest',
        idFields: ['OBJECTID'],
        name: (attributes) => textValue(attributes.Name),
        description: () => 'Campus point of interest',
        kind: 'point-of-interest',
        layerId: 'outdoors',
        systemImage: 'binoculars.fill',
      }),
    ],
    polylines: [],
    polygons: [],
  };
}
