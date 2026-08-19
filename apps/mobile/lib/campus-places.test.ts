import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPUS_PLACES,
  filterCampusPlaces,
  findCampusPlace,
} from './campus-places';
import {
  buildAppleMapsPlaceUrl,
  buildGoogleMapsDirectionsUrl,
} from './campus-directions';

test('campus places expose the three public map categories', () => {
  const categories = new Set(CAMPUS_PLACES.map((place) => place.category));
  assert.deepEqual([...categories].sort(), ['dining', 'essentials', 'study']);
});

test('dining search retains the menu API location id', () => {
  const [porter] = filterCampusPlaces('dining', 'Porter');
  assert.equal(porter?.diningLocationId, '25');
});

test('study locations retain the reservation API library id', () => {
  const mchenry = findCampusPlace('study-mchenry');
  assert.equal(mchenry?.libraryId, 'mchenry');
});

test('search never leaks places from another active category', () => {
  assert.deepEqual(filterCampusPlaces('study', 'Dining Hall'), []);
});

test('Apple Maps fallback keeps the exact pin and its campus place label', () => {
  const campusStore = findCampusPlace('essential-bay-tree');
  assert.ok(campusStore);

  const url = new URL(buildAppleMapsPlaceUrl(campusStore));
  assert.equal(url.searchParams.get('ll'), '36.997986,-122.055493');
  assert.equal(url.searchParams.get('q'), 'Bay Tree Campus Store');
});

test('map labels are safely encoded without changing their text', () => {
  const scienceEngineering = findCampusPlace('study-science-engineering');
  assert.ok(scienceEngineering);

  const url = new URL(buildAppleMapsPlaceUrl(scienceEngineering));
  assert.equal(url.searchParams.get('q'), 'Science & Engineering Library');
});

test('Google directions continue to target the curated coordinates', () => {
  const campusStore = findCampusPlace('essential-bay-tree');
  assert.ok(campusStore);

  const url = new URL(buildGoogleMapsDirectionsUrl(campusStore));
  assert.equal(url.searchParams.get('destination'), '36.997986,-122.055493');
});
