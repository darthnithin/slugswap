import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFoodVendorFeed,
  fetchList,
  parseCoordinates,
  parseListPage,
} from './source';

const vendor = {
  ID: '7',
  AccountID: 'cafe',
  ActiveVendor: 'Yes',
  FoodVendorName: 'Cafe & Truck',
  FlexiDollars: 'Yes',
  RecurringLocation: '10;#Quarry',
  RecurringStartTime: '11:00 AM',
};
const location = {
  ID: '10',
  LocationID: '9.000000000000',
  LocationName: 'Quarry',
  LocationMapLink: '36.998062, -122.055771',
  DaysAvailable: ';#Monday;#Thursday;#',
  StartTime: '8:00 AM',
  EndTime: '5:00 PM',
};
const checkin = {
  ID: '42',
  VendorAccountID: 'cafe',
  VendorName: 'Cafe & Truck',
  LocationID: '9',
  LocationName: 'Quarry',
  Date: '9/24/2026',
  Status: 'Confirmed',
  LocationStartTime: '12:00 PM',
  LocationEndTime: '3:00 PM',
};
const updatedAt = '2026-09-24T19:00:00Z';

test('only active vendors and confirmed check-ins for the requested date are included', () => {
  const result = buildFoodVendorFeed(
    [vendor, { ...vendor, ID: '8', ActiveVendor: 'No' }],
    [location],
    [
      checkin,
      { ...checkin, ID: '43', Status: 'Deleted' },
      { ...checkin, ID: '44', Date: '9/23/2026' },
      { ...checkin, ID: '45', VendorAccountID: 'other' },
    ],
    '2026-09-24',
    updatedAt,
  );
  assert.equal(result.vendors.length, 1);
  assert.equal(result.vendors[0].acceptsFlexi, true);
  assert.equal(result.vendors[0].stops.length, 1);
  assert.equal(result.vendors[0].stops[0].kind, 'check-in');
  assert.equal(result.vendors[0].stops[0].startsAt, '12:00 PM');
  assert.deepEqual(result.vendors[0].stops[0].coordinates, {
    latitude: 36.998062,
    longitude: -122.055771,
  });
});

test('recurring lookup uses SharePoint ID, respects weekdays and vendor time overrides', () => {
  const thursday = buildFoodVendorFeed(
    [vendor],
    [location],
    [],
    '2026-09-24',
    updatedAt,
  ).vendors[0];
  assert.equal(thursday.stops[0].locationId, '9');
  assert.equal(thursday.stops[0].kind, 'recurring');
  assert.equal(thursday.stops[0].startsAt, '11:00 AM');
  assert.equal(thursday.stops[0].endsAt, '5:00 PM');
  const saturday = buildFoodVendorFeed(
    [vendor],
    [location],
    [],
    '2026-09-26',
    updatedAt,
  ).vendors[0];
  assert.deepEqual(saturday.stops, []);
});

test('missing account IDs match vendor names; duplicate check-ins are deduplicated', () => {
  const result = buildFoodVendorFeed(
    [vendor],
    [location],
    [
      { ...checkin, VendorAccountID: 'undefined' },
      { ...checkin, ID: '99', VendorAccountID: '' },
    ],
    '2026-09-24',
    updatedAt,
  );
  assert.equal(result.vendors[0].stops.length, 1);
});

test('invalid coordinates never become map pins, but the location remains in Dining', () => {
  assert.equal(parseCoordinates('https://evil.example'), null);
  assert.equal(parseCoordinates('100, -122'), null);
  assert.equal(parseCoordinates(''), null);
  const feed = buildFoodVendorFeed(
    [vendor],
    [{ ...location, LocationMapLink: '' }],
    [checkin],
    '2026-09-24',
    updatedAt,
  );
  assert.equal(feed.vendors[0].stops[0].coordinates, null);
  assert.equal(feed.vendors[0].stops[0].locationName, 'Quarry');
});

const page = (rows: string, next = '') =>
  `<root xmlns:rs="urn:schemas-microsoft-com:rowset" xmlns:z="#RowsetSchema"><rs:data ${next ? `ListItemCollectionPositionNext="${next}"` : ''}>${rows}</rs:data></root>`;

test('SOAP parsing decodes XML, trims values and rejects error/login pages', () => {
  const parsed = parseListPage(
    page(
      '<z:row ows_ID="1" ows_FoodVendorName=" S&amp;B " />',
      'Paged=TRUE&amp;p_ID=7',
    ),
  );
  assert.equal(parsed.rows[0].FoodVendorName, 'S&B');
  assert.equal(parsed.next, 'Paged=TRUE&p_ID=7');
  assert.throws(() => parseListPage('<html>Sign in</html>'));
  assert.throws(() =>
    parseListPage('<root><faultcode>Error</faultcode></root>'),
  );
});

test('fetch follows pagination and sends date/status filters without returning partial pages', async (t) => {
  const bodies: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(
        bodies.length === 1
          ? page('<z:row ows_ID="1" />', 'Paged=TRUE&amp;p_ID=1')
          : page('<z:row ows_ID="2" />'),
      );
    },
  );
  const rows = await fetchList('checkins', '2026-09-24');
  assert.equal(rows.length, 2);
  assert.match(bodies[0], /9\/24\/2026/);
  assert.match(bodies[0], /Confirmed/);
  assert.match(bodies[1], /Paged=TRUE&amp;p_ID=1/);
});

test('failed upstream requests are errors, not empty schedules', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  );
  await assert.rejects(fetchList('vendors', '2026-09-24'), /503/);
});
