import assert from 'node:assert/strict';
import test from 'node:test';
import {
  foodVendorDate,
  foodVendorPlaces,
  isFoodVendorFeed,
  type FoodVendorFeed,
} from './food-vendors';

const feed: FoodVendorFeed = {
  date: '2026-09-24',
  fetchedAt: '2026-09-24T19:00:00Z',
  vendors: [
    {
      id: 'truck',
      name: 'Test Truck',
      cuisine: null,
      acceptsFlexi: true,
      stops: [
        {
          id: 'stop',
          locationId: '9',
          locationName: 'Quarry',
          coordinates: { latitude: 37, longitude: -122 },
          startsAt: '11 AM',
          endsAt: '3 PM',
          kind: 'check-in',
        },
      ],
    },
  ],
};

test('dates use Pacific midnight in summer and winter, not UTC midnight', () => {
  assert.equal(foodVendorDate(new Date('2026-09-25T06:59:59Z')), '2026-09-24');
  assert.equal(foodVendorDate(new Date('2026-09-25T07:00:00Z')), '2026-09-25');
  assert.equal(foodVendorDate(new Date('2026-12-25T07:59:59Z')), '2026-12-24');
});

test('map pins preserve vendor identity, source status, hours and Flexi', () => {
  const [place] = foodVendorPlaces(feed, '2026-09-24');
  assert.equal(place.category, 'vendors');
  assert.equal(place.id, 'stop');
  assert.match(place.description, /Checked in today/);
  assert.match(place.description, /11 AM–3 PM/);
  assert.match(place.description, /Accepts Flexi/);
});

test('yesterday and unlocated vendors never appear on the map', () => {
  assert.deepEqual(foodVendorPlaces(feed, '2026-09-25'), []);
  const noCoordinates = structuredClone(feed);
  noCoordinates.vendors[0].stops[0].coordinates = null;
  assert.deepEqual(foodVendorPlaces(noCoordinates, '2026-09-24'), []);
});

test('malformed network or stored feed is rejected safely', () => {
  assert.equal(isFoodVendorFeed(feed), true);
  for (const invalid of [
    null,
    {},
    { ...feed, vendors: [null] },
    { ...feed, vendors: [{ ...feed.vendors[0], stops: [null] }] },
  ]) {
    assert.equal(isFoodVendorFeed(invalid), false);
  }
});
