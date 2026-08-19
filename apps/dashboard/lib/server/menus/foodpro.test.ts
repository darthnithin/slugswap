import assert from "node:assert/strict";
import test from "node:test";
import {
  describeFoodProError,
  FoodProError,
  isFoodProCertificateError,
  parseFoodProMenuPage,
} from "./foodpro";

test("describeFoodProError reports a safe chain of error causes", () => {
  const certificateError = Object.assign(
    new Error("unable to verify the first certificate"),
    { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }
  );
  const fetchError = new TypeError("fetch failed", { cause: certificateError });
  const error = new FoodProError("Unable to reach the UCSC menu source.", 503, {
    cause: fetchError,
  });

  assert.deepEqual(describeFoodProError(error), [
    {
      name: "FoodProError",
      message: "Unable to reach the UCSC menu source.",
    },
    { name: "TypeError", message: "fetch failed" },
    {
      name: "Error",
      message: "unable to verify the first certificate",
      code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    },
  ]);
});

test("describeFoodProError stops when an error cause loops", () => {
  const error = new Error("loop") as Error & { cause: unknown };
  error.cause = error;

  assert.deepEqual(describeFoodProError(error), [
    { name: "Error", message: "loop" },
  ]);
});

test("isFoodProCertificateError finds a nested TLS chain error", () => {
  const certificateError = Object.assign(new Error("certificate rejected"), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  });
  const fetchError = new TypeError("fetch failed", { cause: certificateError });

  assert.equal(isFoodProCertificateError(fetchError), true);
  assert.equal(
    isFoodProCertificateError(Object.assign(new Error("socket closed"), {
      code: "ECONNRESET",
    })),
    false
  );
});

test("recognizes FoodPro's explicit no-data page as a valid empty menu", () => {
  const parsed = parseFoodProMenuPage(
    `
      <div class="shortmenutitle">Menus for Wednesday, August 19, 2026</div>
      <select>
        <option value="shortmenu.aspx?dtdate=8/19/2026">Wednesday, August 19</option>
      </select>
      <div class="shortmenuinstructs">No Data Available</div>
    `,
    "2026-08-19"
  );

  assert.deepEqual(parsed, {
    sourceDateLabel: "Menus for Wednesday, August 19, 2026",
    availableDates: [
      { date: "2026-08-19", label: "Wednesday, August 19" },
    ],
    meals: [],
    noDataAvailable: true,
  });
});
