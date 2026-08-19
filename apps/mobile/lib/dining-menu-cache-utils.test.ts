import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDiningMenuWindow,
  isDiningCacheFresh,
} from './dining-menu-cache-utils';

test('builds a consecutive dining menu window across month boundaries', () => {
  assert.deepEqual(getDiningMenuWindow('2026-08-30', 4), [
    '2026-08-30',
    '2026-08-31',
    '2026-09-01',
    '2026-09-02',
  ]);
});

test('treats cached menus as fresh only inside the refresh window', () => {
  const now = Date.parse('2026-08-19T18:00:00.000Z');
  assert.equal(
    isDiningCacheFresh('2026-08-19T17:45:00.000Z', 30 * 60 * 1000, now),
    true
  );
  assert.equal(
    isDiningCacheFresh('2026-08-19T17:00:00.000Z', 30 * 60 * 1000, now),
    false
  );
  assert.equal(isDiningCacheFresh('not-a-date', 30 * 60 * 1000, now), false);
});
