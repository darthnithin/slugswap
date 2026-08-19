import assert from "node:assert/strict";
import test from "node:test";
import { describeFoodProError, FoodProError } from "./foodpro";

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
