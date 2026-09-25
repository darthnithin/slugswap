import * as cheerio from 'cheerio';
import type {
  FoodVendor,
  FoodVendorFeed,
  FoodVendorStop,
} from '../../../../../shared/food-vendors';

type Row = Record<string, string>;
const ENDPOINT = 'https://financial.ucsc.edu/_vti_bin/lists.asmx';
const LISTS = {
  vendors: [
    '000A402A-0588-46D9-BD56-41DA65EA5089',
    'ID AccountID ActiveVendor FoodVendorName CuisineType FlexiDollars RecurringLocation RecurringStartTime RecurringEndTime',
  ],
  locations: [
    '23BA3BBA-D7B2-47BF-88DB-5BB3A4790B71',
    'ID LocationID LocationName LocationMapLink DaysAvailable StartTime EndTime',
  ],
  checkins: [
    'CEF5674F-6F08-4F66-9B42-EAD32DE97E90',
    'ID LocationID LocationName LocationMapLink Date LocationStartTime LocationEndTime VendorAccountID VendorName Status',
  ],
} as const;

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );
}

export function parseListPage(xml: string): {
  rows: Row[];
  next: string | null;
} {
  const $ = cheerio.load(xml, { xmlMode: true });
  if (
    $('faultcode, errorcode').length ||
    $('soap\\:Fault, soapenv\\:Fault').length
  ) {
    throw new Error('UCSC Food Finder returned a list error');
  }
  const data = $('rs\\:data, data').first();
  if (!data.length)
    throw new Error('UCSC Food Finder returned an unexpected response');
  const rows: Row[] = [];
  data.find('z\\:row, row').each((_, element) => {
    const row: Row = {};
    for (const [key, value] of Object.entries(element.attribs)) {
      if (key.startsWith('ows_')) row[key.slice(4)] = value.trim();
    }
    rows.push(row);
  });
  return { rows, next: data.attr('ListItemCollectionPositionNext') || null };
}

export async function fetchList(
  kind: keyof typeof LISTS,
  date: string,
): Promise<Row[]> {
  const [id, fields] = LISTS[kind];
  const [year, month, day] = date.split('-');
  const sourceDate = `${Number(month)}/${Number(day)}/${year}`;
  const where =
    kind === 'checkins'
      ? `<Where><And><Eq><FieldRef Name='Date'/><Value Type='Text'>${sourceDate}</Value></Eq><Eq><FieldRef Name='Status'/><Value Type='Text'>Confirmed</Value></Eq></And></Where>`
      : '';
  const rows: Row[] = [];
  let next: string | null = null;
  const seen = new Set<string>();
  // The SharePoint default view only returns 500 records. Follow continuation
  // tokens even with the date filter rather than silently dropping check-ins.
  for (let page = 0; page < 20; page++) {
    const body = `<soapenv:Envelope xmlns:soapenv='http://schemas.xmlsoap.org/soap/envelope/'><soapenv:Body><GetListItems xmlns='http://schemas.microsoft.com/sharepoint/soap/'><listName>{${id}}</listName><viewName></viewName><viewFields><ViewFields>${fields
      .split(' ')
      .map((field) => `<FieldRef Name='${field}'/>`)
      .join(
        '',
      )}</ViewFields></viewFields><query><Query>${where}</Query></query><rowLimit>500</rowLimit><queryOptions><QueryOptions>${next ? `<Paging ListItemCollectionPositionNext='${escapeXml(next)}'/>` : ''}</QueryOptions></queryOptions></GetListItems></soapenv:Body></soapenv:Envelope>`;
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`UCSC Food Finder request failed (${response.status})`);
    const parsed = parseListPage(await response.text());
    rows.push(...parsed.rows);
    next = parsed.next;
    if (!next) return rows;
    if (seen.has(next)) break;
    seen.add(next);
  }
  throw new Error('UCSC Food Finder pagination did not finish');
}

function numericId(value: string | undefined): string {
  return value && Number.isFinite(Number(value))
    ? String(Number(value))
    : (value ?? '');
}

export function parseCoordinates(
  value: string | undefined,
): FoodVendorStop['coordinates'] {
  if (!value || !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value)) return null;
  const [latitude, longitude] = value.split(',').map(Number);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function buildFoodVendorFeed(
  vendorRows: Row[],
  locationRows: Row[],
  checkins: Row[],
  date: string,
  fetchedAt: string,
): FoodVendorFeed {
  const [year, month, day] = date.split('-');
  const sourceDate = `${Number(month)}/${Number(day)}/${year}`;
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  const vendors: FoodVendor[] = vendorRows
    .filter((row) => row.ActiveVendor === 'Yes' && row.FoodVendorName)
    .map((row) => {
      const id = row.AccountID || `vendor-${row.ID}`;
      const stops: FoodVendorStop[] = [];
      const unique = new Set<string>();
      for (const checkin of checkins) {
        if (checkin.Date !== sourceDate || checkin.Status !== 'Confirmed')
          continue;
        const matches =
          checkin.VendorAccountID && checkin.VendorAccountID !== 'undefined'
            ? checkin.VendorAccountID === row.AccountID
            : checkin.VendorName === row.FoodVendorName;
        if (!matches) continue;
        const locationId = numericId(checkin.LocationID);
        const location = locationRows.find(
          (item) => numericId(item.LocationID) === locationId,
        );
        const locationName = checkin.LocationName || location?.LocationName;
        if (!locationName) continue;
        const stop = {
          id: `${id}:check-in:${checkin.ID}`,
          locationId,
          locationName,
          coordinates:
            parseCoordinates(checkin.LocationMapLink) ??
            parseCoordinates(location?.LocationMapLink),
          startsAt: checkin.LocationStartTime || null,
          endsAt: checkin.LocationEndTime || null,
          kind: 'check-in' as const,
        };
        const key = `${locationName}:${stop.startsAt}:${stop.endsAt}`;
        if (!unique.has(key)) {
          stops.push(stop);
          unique.add(key);
        }
      }
      // RecurringLocation is a SharePoint lookup ID, NOT the public LocationID.
      const [lookupId, lookupName] = (row.RecurringLocation || '').split(';#');
      const recurring = row.RecurringLocation
        ? locationRows.find(
            (location) =>
              location.ID === lookupId ||
              location.LocationName === lookupName?.trim(),
          )
        : undefined;
      if (
        recurring?.DaysAvailable?.split(';#').includes(weekday) &&
        !stops.some(
          (stop) => stop.locationId === numericId(recurring.LocationID),
        )
      ) {
        stops.push({
          id: `${id}:recurring:${recurring.ID}`,
          locationId: numericId(recurring.LocationID),
          locationName: recurring.LocationName,
          coordinates: parseCoordinates(recurring.LocationMapLink),
          startsAt: row.RecurringStartTime || recurring.StartTime || null,
          endsAt: row.RecurringEndTime || recurring.EndTime || null,
          kind: 'recurring',
        });
      }
      return {
        id,
        name: row.FoodVendorName,
        cuisine: row.CuisineType || null,
        acceptsFlexi: row.FlexiDollars === 'Yes',
        stops,
      };
    });
  vendors.sort((a, b) => a.name.localeCompare(b.name));
  return { date, fetchedAt, vendors };
}

export async function fetchFoodVendorFeed(
  date: string,
): Promise<FoodVendorFeed> {
  const [vendors, locations, checkins] = await Promise.all([
    fetchList('vendors', date),
    fetchList('locations', date),
    fetchList('checkins', date),
  ]);
  return buildFoodVendorFeed(
    vendors,
    locations,
    checkins,
    date,
    new Date().toISOString(),
  );
}
