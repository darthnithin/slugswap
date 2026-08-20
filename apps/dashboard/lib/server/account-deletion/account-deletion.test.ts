import assert from "node:assert/strict";
import test from "node:test";
import { runAccountDeletion } from "../account-deletion";

test("account deletion revokes, deletes stored data, then removes the identity", async () => {
  const calls: string[] = [];

  await runAccountDeletion(
    async () => void calls.push("revoke"),
    async () => void calls.push("data"),
    async () => void calls.push("identity")
  );

  assert.deepEqual(calls, ["revoke", "data", "identity"]);
});

test("GET revocation failure does not block deletion", async () => {
  const calls: string[] = [];
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    await runAccountDeletion(
      async () => {
        calls.push("revoke");
        throw new Error("provider unavailable");
      },
      async () => void calls.push("data"),
      async () => void calls.push("identity")
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(calls, ["revoke", "data", "identity"]);
});

test("identity deletion does not run when stored-data deletion fails", async () => {
  const calls: string[] = [];

  await assert.rejects(
    runAccountDeletion(
      async () => void calls.push("revoke"),
      async () => {
        calls.push("data");
        throw new Error("database unavailable");
      },
      async () => void calls.push("identity")
    ),
    /database unavailable/
  );

  assert.deepEqual(calls, ["revoke", "data"]);
});
