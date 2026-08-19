import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRoomCheckoutUrl,
  buildLibraryReservationUrl,
  formatReservationDate,
  formatSlotTime,
  getPacificDate,
  getReservationDates,
} from './library-reservations';

test('builds the official McHenry reservation URL', () => {
  const url = new URL(buildLibraryReservationUrl('mchenry'));

  assert.equal(url.origin, 'https://calendar.library.ucsc.edu');
  assert.equal(url.pathname, '/spaces');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    lid: '16577',
    gid: '34977',
    c: '0',
  });
});

test('builds the official Science & Engineering reservation URL', () => {
  const url = new URL(buildLibraryReservationUrl('science-engineering'));

  assert.equal(url.searchParams.get('lid'), '16578');
  assert.equal(url.searchParams.get('gid'), '34972');
});

test('builds eight UCSC-local reservation dates across year boundaries', () => {
  assert.equal(getPacificDate(new Date('2026-08-19T02:00:00Z')), '2026-08-18');
  assert.deepEqual(getReservationDates('2026-12-29'), [
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
    '2027-01-04',
    '2027-01-05',
  ]);
});

test('formats native date and time labels without timezone drift', () => {
  assert.deepEqual(formatReservationDate('2026-08-20'), {
    weekday: 'Thu',
    monthDay: 'Aug 20',
    full: 'Thursday, August 20',
  });
  assert.equal(formatSlotTime('2026-08-20 08:30:00'), '8:30 AM');
  assert.equal(formatSlotTime('2026-08-20 12:00:00'), '12:00 PM');
});

test('builds a room checkout URL that LibCal uses to preselect the start time', () => {
  const url = new URL(buildRoomCheckoutUrl(139577, '2026-08-20 08:30:00'));
  assert.equal(url.pathname, '/space/139577');
  assert.equal(url.searchParams.get('date'), '2026-08-20 08:30:00');
  assert.throws(() => buildRoomCheckoutUrl(-1, 'not-a-time'));
});
