import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseAvailableLocationId,
  sortDiningLocations,
} from './dining-locations';

const locations = [
  { id: '40', slug: 'college-nine', name: 'College 9/JRL', closed: true },
  { id: '05', slug: 'cowell-stevenson', name: 'Cowell/Stevenson', closed: false },
  { id: '20', slug: 'crown-merrill', name: 'Crown/Merrill', closed: true },
  { id: '30', slug: 'rcc-oakes', name: 'RCC/Oakes', closed: false },
];

test('moves closed dining locations to the end without reordering peers', () => {
  assert.deepEqual(
    sortDiningLocations(locations).map((location) => location.id),
    ['05', '30', '40', '20']
  );
});

test('falls back from a closed preference to the first available location', () => {
  const sorted = sortDiningLocations(locations);
  assert.equal(chooseAvailableLocationId(sorted, ['40']), '05');
  assert.equal(chooseAvailableLocationId(sorted, ['30']), '30');
});
