import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPUS_PLACES,
  filterCampusPlaces,
  findCampusPlace,
} from './campus-places';

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
