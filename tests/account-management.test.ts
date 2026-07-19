import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccountUpdateEvent,
  buildInitialAccountEvents,
} from "../src/domain/account-management";
import { rebuildLedgerSnapshot } from "../src/storage/event-store";

const ids = {
  accountId: "10000000-0000-4000-8000-000000000001",
  accountCreatedEventId: "20000000-0000-4000-8000-000000000001",
  contributionEventId: "20000000-0000-4000-8000-000000000002",
  valuationEventId: "20000000-0000-4000-8000-000000000003",
};

test("new-account events consistently use the user-selected currency", () => {
  const events = buildInitialAccountEvents(
    { name: "Japan account", startDate: "2025-01-02", initialValue: "123456", currency: "JPY" },
    "sp500",
    ids,
    Date.parse("2025-01-02T00:00:00.000Z"),
    { contribution: "Initial contribution", valuation: "Initial asset value" },
  );

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => "currency" in event ? event.currency : null), ["JPY", "JPY", "JPY"]);
  assert.equal(events[1]?.type === "cash-flow" ? events[1].amount : null, "123456");
  assert.equal(events[2]?.type === "valuation" ? events[2].totalValue : null, "123456");
});

test("account edits and archive changes remain immutable ledger events", () => {
  const initial = buildInitialAccountEvents(
    { name: "Original", startDate: "2025-01-02", initialValue: "100.00", currency: "EUR" },
    "sp500",
    ids,
    Date.parse("2025-01-02T00:00:00.000Z"),
    { contribution: "Initial contribution", valuation: "Initial asset value" },
  );
  const account = rebuildLedgerSnapshot(initial).accounts[0];
  assert.ok(account);

  const renamed = buildAccountUpdateEvent(
    account,
    { name: "Retirement", benchmarkId: "none" },
    "20000000-0000-4000-8000-000000000004",
    "2025-02-01T00:00:00.000Z",
  );
  const archived = buildAccountUpdateEvent(
    account,
    { archived: true },
    "20000000-0000-4000-8000-000000000005",
    "2025-02-02T00:00:00.000Z",
  );

  const snapshot = rebuildLedgerSnapshot([...initial, renamed, archived]);
  assert.equal(snapshot.accounts[0]?.name, "Retirement");
  assert.equal(snapshot.accounts[0]?.benchmarkId, "none");
  assert.equal(snapshot.accounts[0]?.archived, true);
  assert.equal(snapshot.accounts[0]?.currency, "EUR");
  assert.equal(snapshot.events.length, 5);
});

test("account update dates never precede the account opening date", () => {
  const account = {
    accountId: ids.accountId,
    name: "Future-dated account",
    currency: "USD" as const,
    benchmarkId: "sp500" as const,
    openedOn: "2025-05-01",
    archived: false,
  };
  const update = buildAccountUpdateEvent(
    account,
    { archived: true },
    "20000000-0000-4000-8000-000000000006",
    "2025-04-01T00:00:00.000Z",
  );
  assert.equal(update.effectiveDate, "2025-05-01");
});
