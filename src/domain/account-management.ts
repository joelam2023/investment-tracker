import { normalizeMoney } from "./money";
import type {
  AccountState,
  AccountUpdatedEvent,
  BenchmarkId,
  Currency,
  LedgerEvent,
} from "../types";

export interface InitialAccountInput {
  name: string;
  startDate: string;
  initialValue: string;
  currency: Currency;
}

export interface InitialAccountIds {
  accountId: string;
  accountCreatedEventId: string;
  contributionEventId: string;
  valuationEventId: string;
}

export interface InitialAccountNotes {
  contribution: string;
  valuation: string;
}

export function buildInitialAccountEvents(
  input: InitialAccountInput,
  benchmarkId: BenchmarkId,
  ids: InitialAccountIds,
  recordedAtBase: number,
  notes: InitialAccountNotes,
): LedgerEvent[] {
  const amount = normalizeMoney(input.initialValue, input.currency);
  const common = { schemaVersion: 1 as const, effectiveDate: input.startDate };
  return [
    {
      ...common,
      type: "account-created",
      eventId: ids.accountCreatedEventId,
      recordedAt: new Date(recordedAtBase).toISOString(),
      accountId: ids.accountId,
      name: input.name,
      currency: input.currency,
      benchmarkId,
    },
    {
      ...common,
      type: "cash-flow",
      eventId: ids.contributionEventId,
      recordedAt: new Date(recordedAtBase + 1).toISOString(),
      accountId: ids.accountId,
      direction: "contribution",
      amount,
      currency: input.currency,
      note: notes.contribution,
    },
    {
      ...common,
      type: "valuation",
      eventId: ids.valuationEventId,
      recordedAt: new Date(recordedAtBase + 2).toISOString(),
      accountId: ids.accountId,
      totalValue: amount,
      currency: input.currency,
      note: notes.valuation,
    },
  ];
}

export function buildAccountUpdateEvent(
  account: AccountState,
  changes: Pick<AccountUpdatedEvent, "name" | "benchmarkId" | "archived">,
  eventId: string,
  recordedAt: string,
): AccountUpdatedEvent {
  const today = recordedAt.slice(0, 10);
  return {
    schemaVersion: 1,
    type: "account-updated",
    eventId,
    recordedAt,
    effectiveDate: today < account.openedOn ? account.openedOn : today,
    accountId: account.accountId,
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.benchmarkId === undefined ? {} : { benchmarkId: changes.benchmarkId }),
    ...(changes.archived === undefined ? {} : { archived: changes.archived }),
  };
}
