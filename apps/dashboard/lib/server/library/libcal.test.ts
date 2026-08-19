import assert from "node:assert/strict";
import test from "node:test";

import {
  LibCalError,
  mergeAvailability,
  parseLibCalRooms,
  validateReservationDate,
} from "./libcal";

const CATALOG_FIXTURE = `
  resources.push({
    id: "eid_123",
    title: "Room\\u0020135 (Capacity 5)",
    eid: 123,
    capacity: 5,
    thumbnail: "//images.example.edu/room.jpg",
  });
  resourceNameIdMap["eid_123"] = "Room\\u0020135";
  resources.push({
    id: "eid_456",
    title: "Room\\u0020137 (Capacity 7)",
    eid: 456,
    capacity: 7,
    thumbnail: "",
  });
  resourceNameIdMap["eid_456"] = "Room\\u0020137";
`;

test("parses room metadata embedded in LibCal", () => {
  assert.deepEqual(parseLibCalRooms(CATALOG_FIXTURE), [
    {
      id: 123,
      name: "Room 135",
      capacity: 5,
      thumbnailUrl: "https://images.example.edu/room.jpg",
    },
    { id: 456, name: "Room 137", capacity: 7, thumbnailUrl: null },
  ]);
});

test("keeps only available slots and ignores unknown rooms", () => {
  const rooms = parseLibCalRooms(CATALOG_FIXTURE);
  const merged = mergeAvailability(rooms, [
    { itemId: 123, start: "2026-08-20 08:00:00", end: "2026-08-20 08:30:00" },
    {
      itemId: 123,
      start: "2026-08-20 08:30:00",
      end: "2026-08-20 09:00:00",
      className: "s-lc-eq-unavailable",
    },
    { itemId: 999, start: "2026-08-20 08:00:00", end: "2026-08-20 08:30:00" },
  ]);

  assert.deepEqual(merged[0].availableSlots, [
    { start: "2026-08-20 08:00:00", end: "2026-08-20 08:30:00" },
  ]);
  assert.deepEqual(merged[1].availableSlots, []);
});

test("limits requests to UCSC's one-week booking window", () => {
  assert.doesNotThrow(() => validateReservationDate("2026-08-18", "2026-08-18"));
  assert.doesNotThrow(() => validateReservationDate("2026-08-25", "2026-08-18"));
  assert.throws(
    () => validateReservationDate("2026-08-26", "2026-08-18"),
    (error) => error instanceof LibCalError && error.status === 400,
  );
  assert.throws(() => validateReservationDate("not-a-date", "2026-08-18"));
});
