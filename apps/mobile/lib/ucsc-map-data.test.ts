import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCampusBuildingSearchUrl,
  escapeArcGisLiteral,
  normalizeBuildingFeatures,
} from './ucsc-map-data';

test('ArcGIS literals escape apostrophes instead of altering the search text', () => {
  assert.equal(escapeArcGisLiteral("Oakes' advising"), "Oakes'' advising");
});

test('building search waits for at least two non-whitespace characters', () => {
  assert.equal(buildCampusBuildingSearchUrl('  b  '), null);
  assert.ok(buildCampusBuildingSearchUrl('ba'));
});

test('building search covers names, aliases, departments, and labels', () => {
  const rawUrl = buildCampusBuildingSearchUrl("Oakes' advising");
  assert.ok(rawUrl);
  const url = new URL(rawUrl);
  const where = url.searchParams.get('where') ?? '';

  assert.match(where, /BUILDINGNAME LIKE/);
  assert.match(where, /ALIAS LIKE/);
  assert.match(where, /DEPARTMENTS LIKE/);
  assert.match(where, /LABELNAME LIKE/);
  assert.match(where, /Oakes'' advising/);
  assert.equal(url.searchParams.get('returnGeometry'), 'false');
  assert.equal(url.searchParams.get('resultRecordCount'), '50');
});

test('building normalization ranks an exact building ahead of department matches', () => {
  const results = normalizeBuildingFeatures(
    {
      features: [
        {
          attributes: {
            OBJECTID: 1,
            BUILDINGNAME: 'Engineering 2',
            DEPARTMENTS: 'Baskin Engineering',
            LONGITUDE: '-122.063',
            LATITUDE: '37.000',
          },
        },
        {
          attributes: {
            OBJECTID: 2,
            BUILDINGNAME: 'Baskin Engineering',
            ADDRESS: '1156 High Street',
            LONGITUDE: '-122.062',
            LATITUDE: '37.001',
          },
        },
      ],
    },
    'Baskin Engineering',
  );

  assert.equal(results[0]?.name, 'Baskin Engineering');
  assert.equal(results[0]?.description, '1156 High Street');
  assert.deepEqual(results[0]?.coordinates, {
    latitude: 37.001,
    longitude: -122.062,
  });
  assert.equal(results[1]?.name, 'Engineering 2');
});

test('building normalization drops records without valid names or coordinates', () => {
  const results = normalizeBuildingFeatures(
    {
      features: [
        {
          attributes: {
            OBJECTID: 1,
            BUILDINGNAME: 'Missing coordinates',
          },
        },
        {
          attributes: {
            OBJECTID: 2,
            LONGITUDE: '-122.062',
            LATITUDE: '37.001',
          },
        },
      ],
    },
    'missing',
  );

  assert.deepEqual(results, []);
});
