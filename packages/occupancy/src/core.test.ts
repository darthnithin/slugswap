import { test } from "node:test";
import assert from "node:assert/strict";
import { FACILITIES, parseOccupancy, slotFor, fetchOccupancy } from "./core";

function card(count = "11", remaining = "25", ratio = "0.31") {
  const canvas = `<canvas class="occupancy-chart" data-occupancy="${count}" data-remaining="${remaining}" data-ratio="${ratio}"></canvas>`;
  return `<div data-facilityid="${FACILITIES[0].id}">${canvas}${canvas}</div>`;
}

test("duplicate responsive canvases produce one observation; missing facilities are not zeros", () => {
  const samples = parseOccupancy(card());
  assert.equal(samples.length, 15);
  assert.deepEqual(samples[0], {
    facilityId: FACILITIES[0].id,
    status: "ok",
    occupancy: 11,
    capacity: 36,
    ratio: 0.31,
    error: null,
  });
  assert.equal(samples[1].status, "missing");
  assert.equal(samples[1].occupancy, null);
});
test("a legitimate zero remains a zero", () => {
  assert.equal(parseOccupancy(card("0", "150", "0"))[0].occupancy, 0);
});
test("missing/invalid attributes do not coerce to zero", () => {
  for (const value of ["", "NaN", "-1", "1.2", "Infinity"]) {
    const sample = parseOccupancy(card(value))[0];
    assert.equal(sample.status, "invalid", value);
    assert.equal(sample.occupancy, null);
  }
});
test("inconsistent ratio or responsive canvases are rejected", () => {
  assert.equal(parseOccupancy(card("11", "25", ".9"))[0].status, "invalid");
  assert.equal(
    parseOccupancy(
      card().replace('data-occupancy="11"', 'data-occupancy="12"'),
    )[0].status,
    "invalid",
  );
});
test("over-capacity readings are retained, not clamped", () => {
  const sample = parseOccupancy(card("110", "-10", "1.1"))[0];
  assert.equal(sample.occupancy, 110);
  assert.equal(sample.capacity, 100);
});
test("login/error pages cannot silently become zero observations", () => {
  assert.throws(
    () => parseOccupancy("<html>Sign in</html>"),
    /No facility cards/,
  );
});
test("UTC slots remain distinct across the Pacific daylight-saving repeated hour", () => {
  assert.equal(
    slotFor(new Date("2026-11-01T08:44:22Z")).toISOString(),
    "2026-11-01T08:30:00.000Z",
  );
  assert.equal(
    slotFor(new Date("2026-11-01T09:44:22Z")).toISOString(),
    "2026-11-01T09:30:00.000Z",
  );
});
test("HTTP failures stay failed and successful HTML retains the fetch timestamp", async () => {
  const failed = await fetchOccupancy(
    (async () => new Response("Forbidden", { status: 403 })) as typeof fetch,
  );
  assert.equal(failed.httpStatus, 403);
  assert.equal(failed.samples.length, 0);
  assert.equal(failed.fetchedAt, null);
  const success = await fetchOccupancy(
    (async () => new Response(card())) as typeof fetch,
  );
  assert.equal(success.samples[0].occupancy, 11);
  assert.ok(success.fetchedAt instanceof Date);
});
