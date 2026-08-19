import assert from "node:assert/strict";
import test from "node:test";

import {
  parseActiveMbhiOptions,
  parseOfficialCurrentStatus,
} from "./schedule";

test("extracts the active seasonal schedule from the official UCSC hours page", () => {
  const options =
    'location="College Nine⁄JRL Dining Hall - Summer Hours" format="12"';
  const encoded = Buffer.from(options, "utf8").toString("base64");
  const html = `<span data-fetch-shortcode data-code="mbhi" data-arguments="${encoded}"></span>`;

  assert.equal(parseActiveMbhiOptions(html), options);
});

test("parses official open and closed status responses", () => {
  assert.deepEqual(
    parseOfficialCurrentStatus(
      '<span class="mb-bhi-display mb-bhi-closed">We are closed.</span>'
    ),
    { closed: true, label: "Currently closed" }
  );
  assert.deepEqual(
    parseOfficialCurrentStatus(
      '<span class="mb-bhi-display mb-bhi-open">We are open.</span>'
    ),
    { closed: false, label: "Currently open" }
  );
});
