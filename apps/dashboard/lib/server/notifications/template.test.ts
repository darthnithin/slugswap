import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExpoPushMessages,
  formatNotificationAmount,
  parseExpoPushTickets,
  renderDonorSpendTemplate,
  serializeExpoPushTickets,
  summarizeExpoPushReceipts,
  summarizeExpoPushTickets,
} from "./template";

test("Expo messages preserve configured title and body exactly", () => {
  assert.deepEqual(
    buildExpoPushMessages(
      ["ExponentPushToken[first]"],
      "A donor title",
      "Exact body punctuation — unchanged!",
      "claim-123"
    ),
    [
      {
        to: "ExponentPushToken[first]",
        title: "A donor title",
        body: "Exact body punctuation — unchanged!",
        sound: "default",
        channelId: "donor-updates",
        data: { kind: "donor_spend", claimCodeId: "claim-123" },
      },
    ]
  );
});

test("donor spend templates preserve exact configured copy and replace every amount token", () => {
  assert.equal(
    renderDonorSpendTemplate("You shared {{amount}} points. Exactly {{ amount }}!", {
      amount: 12.5,
    }),
    "You shared 12.5 points. Exactly 12.5!"
  );
  assert.equal(renderDonorSpendTemplate("Thank you, Banana Slug!", { amount: 10 }), "Thank you, Banana Slug!");
});

test("notification amounts are stable and limited to two decimal places", () => {
  assert.equal(formatNotificationAmount(10), "10");
  assert.equal(formatNotificationAmount(10.5), "10.5");
  assert.equal(formatNotificationAmount(10.126), "10.13");
});

test("Expo ticket summaries retain successes and identify dead device tokens", () => {
  assert.deepEqual(
    summarizeExpoPushTickets(
      {
        data: [
          { status: "ok", id: "ticket-1" },
          {
            status: "error",
            message: "The device is no longer registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      },
      ["ExponentPushToken[first]", "ExponentPushToken[second]"]
    ),
    {
      errors: ["The device is no longer registered"],
      successfulTickets: [
        { id: "ticket-1", token: "ExponentPushToken[first]" },
      ],
      unregisteredTokens: ["ExponentPushToken[second]"],
    }
  );
});

test("invalid Expo responses fail closed", () => {
  assert.deepEqual(summarizeExpoPushTickets({}, ["ExponentPushToken[first]"]), {
    errors: ["Expo Push API returned an invalid response"],
    successfulTickets: [],
    unregisteredTokens: [],
  });
});

test("ticket mappings round-trip for later receipt checks", () => {
  const tickets = [
    { id: "ticket-1", token: "ExponentPushToken[first]" },
    { id: "ticket-2", token: "ExponentPushToken[second]" },
  ];
  assert.deepEqual(parseExpoPushTickets(serializeExpoPushTickets(tickets)), tickets);
  assert.equal(parseExpoPushTickets('[{"id":"ticket-1"}]'), null);
  assert.equal(parseExpoPushTickets("not-json"), null);
});

test("receipt summaries retain pending tickets and identify dead devices", () => {
  assert.deepEqual(
    summarizeExpoPushReceipts(
      {
        data: {
          "ticket-1": { status: "ok" },
          "ticket-2": {
            status: "error",
            message: "The device is no longer registered",
            details: { error: "DeviceNotRegistered" },
          },
        },
      },
      [
        { id: "ticket-1", token: "ExponentPushToken[first]" },
        { id: "ticket-2", token: "ExponentPushToken[second]" },
        { id: "ticket-3", token: "ExponentPushToken[third]" },
      ]
    ),
    {
      errors: ["The device is no longer registered"],
      isValid: true,
      pendingTicketIds: ["ticket-3"],
      successfulTicketIds: ["ticket-1"],
      unregisteredTokens: ["ExponentPushToken[second]"],
    }
  );
});

test("invalid receipt responses fail closed", () => {
  assert.deepEqual(
    summarizeExpoPushReceipts({}, [
      { id: "ticket-1", token: "ExponentPushToken[first]" },
    ]),
    {
      errors: ["Expo Push Receipt API returned an invalid response"],
      isValid: false,
      pendingTicketIds: [],
      successfulTicketIds: [],
      unregisteredTokens: [],
    }
  );
});
