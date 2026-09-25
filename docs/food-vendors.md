# UCSC food vendors

Dining has a Food vendors section; the campus map has a Food vendors category.
Both read the public `/api/food-vendors` endpoint. Cards link to the matching map
stop, and the map links back to the vendor directory in Dining.

## Source and freshness

Data comes from [UCSC Food Finder](https://financial.ucsc.edu/Pages/Food_Trucks.aspx)
and its public SharePoint `GetListItems` service. The adapter requests only public
vendor, location, and schedule fields (no contacts or credentials).

- Only active vendors appear in the directory.
- Check-ins must be Confirmed and match today's date in America/Los_Angeles.
- Recurring stops follow the location's published weekdays and vendor time overrides.
  The lookup refers to the SharePoint item ID, not the public location ID.
- An explicit check-in replaces a recurring stop at the same location.
- Check-ins and recurring schedules have distinct labels. Neither means live GPS
  or guaranteed open status. Vendors without a stop remain in the directory.
- Missing/invalid coordinates prevent a map pin, not the Dining listing.
- The server caches successful snapshots for five minutes, keyed by Pacific date.
  SharePoint queries filter today's confirmed entries and follow pagination.
- Mobile keeps a same-day snapshot in AsyncStorage. Focus, foreground, and periodic
  refreshes update it. Failed/stale refreshes display a saved-schedule notice.
  A previous day's snapshot is not used as today's schedule.

The public source is not a documented, versioned API. If its list schema changes,
update `apps/dashboard/lib/server/food-vendors/source.ts`. No database or secrets
are needed.

## Verification and release

Run `npm run typecheck` and:

```sh
node --import tsx --test apps/dashboard/lib/server/food-vendors/source.test.ts apps/mobile/lib/food-vendors.test.ts apps/mobile/lib/campus-places.test.ts
```

Check Dining's Food vendors section, a card's Map action, vendor search, and the
return link to Dining. On iOS, confirm the selected vendor pin and Maps directions.
Web and Android use the existing place-list fallback.

To make the changes live, deploy the API first:

1. `npm run dashboard:deploy:prod` (or `npm run dashboard:deploy` for a preview).
2. After verifying `/api/food-vendors`, run `npm run mobile:eas:update` for the
   existing production runtime, or `npm run mobile:eas:testflight` for a new build.

No schema changes, environment variables, or new project dependencies are required.
