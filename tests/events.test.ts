import assert from "node:assert/strict";
import test from "node:test";
import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import type { LedgerEvent } from "../src/types";
import { LedgerEventStore, rebuildLedgerSnapshot, validateLedgerEvent } from "../src/storage/event-store";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const CREATE_ID = "20000000-0000-4000-8000-000000000001";
const FLOW_ID = "20000000-0000-4000-8000-000000000002";
const CORRECTION_ID = "20000000-0000-4000-8000-000000000003";
const VOID_ID = "20000000-0000-4000-8000-000000000004";

const created: LedgerEvent = {
  schemaVersion: 1,
  eventId: CREATE_ID,
  recordedAt: "2025-01-01T00:00:00.000Z",
  effectiveDate: "2025-01-01",
  type: "account-created",
  accountId: ACCOUNT_ID,
  name: "Long-term investment",
  currency: "SGD",
  benchmarkId: "sp500",
};

const flow: LedgerEvent = {
  schemaVersion: 1,
  eventId: FLOW_ID,
  recordedAt: "2025-01-01T00:00:01.000Z",
  effectiveDate: "2025-01-01",
  type: "cash-flow",
  accountId: ACCOUNT_ID,
  direction: "contribution",
  amount: "100.00",
  currency: "SGD",
};

test("validates money and event shape", () => {
  assert.equal(validateLedgerEvent(flow).eventId, FLOW_ID);
  assert.throws(() => validateLedgerEvent({ ...flow, amount: "1.234" }), /Invalid amount/);
  assert.throws(() => validateLedgerEvent({ ...flow, eventId: "../escape" }), /eventId/);
});

test("rebuilds an account and deduplicates event ids", () => {
  const snapshot = rebuildLedgerSnapshot([created, flow, { ...flow }]);
  assert.equal(snapshot.accounts.length, 1);
  assert.equal(snapshot.events.filter((event) => event.type === "cash-flow").length, 1);
  assert.ok(snapshot.warnings.some((warning) => warning.includes("duplicate eventId")));
});

test("superseding correction replaces the original without deleting it", () => {
  const correction: LedgerEvent = {
    ...flow,
    eventId: CORRECTION_ID,
    recordedAt: "2025-01-02T00:00:00.000Z",
    amount: "120.00",
    supersedesEventId: FLOW_ID,
  };
  const snapshot = rebuildLedgerSnapshot([created, flow, correction]);
  const effectiveFlows = snapshot.events.filter((event) => event.type === "cash-flow");
  assert.equal(effectiveFlows.length, 1);
  assert.equal(effectiveFlows[0]?.eventId, CORRECTION_ID);
});

test("void events remove a target from the effective snapshot", () => {
  const voidEvent: LedgerEvent = {
    schemaVersion: 1,
    eventId: VOID_ID,
    recordedAt: "2025-01-03T00:00:00.000Z",
    effectiveDate: "2025-01-03",
    type: "event-voided",
    targetEventId: FLOW_ID,
    reason: "test",
  };
  const snapshot = rebuildLedgerSnapshot([created, flow, voidEvent]);
  assert.equal(snapshot.events.some((event) => event.eventId === FLOW_ID), false);
  assert.equal(snapshot.events.some((event) => event.type === "event-voided"), false);
});

test("invalid or future-schema events fail validation instead of being repaired", () => {
  assert.throws(() => validateLedgerEvent("broken"), /JSON object/);
  assert.throws(() => validateLedgerEvent({ ...created, schemaVersion: 2 }), /Unsupported/);
  assert.throws(() => validateLedgerEvent({ ...created, effectiveDate: "2025-02-31" }), /effectiveDate/);
});

test("validation strips unknown fields before persistence", () => {
  const validated = validateLedgerEvent({ ...flow, unexpected: "must-not-persist" }) as unknown as Record<string, unknown>;
  assert.equal("unexpected" in validated, false);
});

test("conflicting duplicate ids stop snapshot reconstruction", () => {
  assert.throws(
    () => rebuildLedgerSnapshot([created, flow, { ...flow, amount: "101.00" }]),
    /Conflicting duplicate eventId/,
  );
});

test("multiple concurrent corrections to one event stop reconstruction", () => {
  const first: LedgerEvent = {
    ...flow,
    eventId: CORRECTION_ID,
    recordedAt: "2025-01-02T00:00:00.000Z",
    supersedesEventId: FLOW_ID,
  };
  const second: LedgerEvent = {
    ...flow,
    eventId: "20000000-0000-4000-8000-000000000005",
    recordedAt: "2025-01-03T00:00:00.000Z",
    supersedesEventId: FLOW_ID,
  };
  assert.throws(() => rebuildLedgerSnapshot([created, flow, first, second]), /Multiple concurrent corrections/);
});

test("control events cannot erase account definitions", () => {
  const invalidVoid: LedgerEvent = {
    schemaVersion: 1,
    eventId: VOID_ID,
    recordedAt: "2025-01-03T00:00:00.000Z",
    effectiveDate: "2025-01-03",
    type: "event-voided",
    targetEventId: CREATE_ID,
  };
  assert.throws(() => rebuildLedgerSnapshot([created, invalidVoid]), /Only cash-flow or valuation records can be voided/);
});

class MemoryVault {
  private readonly folders = new Set<string>();
  private readonly files = new Map<string, { file: TFile; content: string }>();
  private readonly adapterFiles = new Map<string, string>();

  readonly adapter = {
    exists: async (path: string): Promise<boolean> => this.adapterFiles.has(path) || this.files.has(path),
    read: async (path: string): Promise<string> => {
      const content = this.adapterFiles.get(path) ?? this.files.get(path)?.content;
      if (content === undefined) throw new Error("missing");
      return content;
    },
    remove: async (path: string): Promise<void> => {
      this.adapterFiles.delete(path);
      this.files.delete(path);
    },
  };

  asVault(): Vault {
    return this as unknown as Vault;
  }

  getAbstractFileByPath(path: string): TFile | { path: string } | null {
    return this.files.get(path)?.file ?? (this.folders.has(path) ? { path } : null);
  }

  getFiles(): TFile[] {
    return [...this.files.values()].map((entry) => entry.file);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path) || this.folders.has(path)) throw new Error("exists");
    const file = new TFile();
    file.path = path;
    file.name = path.split("/").at(-1) ?? path;
    file.basename = file.name.replace(/\.[^.]+$/, "");
    file.extension = file.name.includes(".") ? file.name.split(".").at(-1) ?? "" : "";
    this.files.set(path, { file, content });
    return file;
  }

  async cachedRead(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error("missing");
    return entry.content;
  }

  async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error("missing");
    return entry.content;
  }

  async rename(file: TFile, path: string): Promise<void> {
    if (this.files.has(path)) throw new Error("exists");
    const entry = this.files.get(file.path);
    if (!entry) throw new Error("missing");
    this.files.delete(file.path);
    file.path = path;
    file.name = path.split("/").at(-1) ?? path;
    file.basename = file.name.replace(/\.[^.]+$/, "");
    file.extension = file.name.split(".").at(-1) ?? "";
    this.files.set(path, entry);
  }

  async delete(file: TFile): Promise<void> {
    this.files.delete(file.path);
  }

  async process(file: TFile, callback: (content: string) => string): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error("missing");
    entry.content = callback(entry.content);
    return entry.content;
  }

  async inject(path: string, content: string): Promise<void> {
    const segments = path.split("/").slice(0, -1);
    for (let index = 1; index <= segments.length; index += 1) {
      this.folders.add(segments.slice(0, index).join("/"));
    }
    await this.create(path, content);
  }

  injectAdapterFile(path: string, content: string): void {
    this.adapterFiles.set(path, content);
  }

  hasAdapterFile(path: string): boolean {
    return this.adapterFiles.has(path);
  }

  readText(path: string): string {
    const entry = this.files.get(path);
    if (!entry) throw new Error("missing");
    return entry.content;
  }
}

test("event store stages, verifies, renames, reloads, and deduplicates an immutable event", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  assert.equal(await store.appendEvent(created), true);
  assert.equal(await store.appendEvent(created), false);
  assert.equal(await store.appendEvent(flow), true);
  const snapshot = await store.loadSnapshot();
  assert.equal(snapshot.accounts[0]?.name, "Long-term investment");
  assert.equal(snapshot.events.some((event) => event.eventId === FLOW_ID), true);
});

test("event store resumes a matching pending file after an interrupted write", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await store.initialize();
  const pendingPath = `ledger/events/2025/01/.pending-${CREATE_ID}.tmp`;
  const finalPath = `ledger/events/2025/01/${CREATE_ID}.json`;
  await memory.inject(pendingPath, JSON.stringify(created, null, 2));
  assert.equal(await store.appendEvent(created), true);
  assert.equal(memory.getAbstractFileByPath(pendingPath), null);
  assert.equal(memory.readText(finalPath).includes(CREATE_ID), true);
});

test("event store resumes a matching pending file that is not in the Vault index", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await store.initialize();
  const pendingPath = `ledger/events/2025/01/.pending-${CREATE_ID}.tmp`;
  const finalPath = `ledger/events/2025/01/${CREATE_ID}.json`;
  memory.injectAdapterFile(pendingPath, JSON.stringify(created, null, 2));
  assert.equal(memory.getAbstractFileByPath(pendingPath), null);
  assert.equal(await store.appendEvent(created), true);
  assert.equal(memory.hasAdapterFile(pendingPath), false);
  assert.equal(memory.readText(finalPath).includes(CREATE_ID), true);
});

test("event store preserves a conflicting pending file and does not create a final event", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await store.initialize();
  const pendingPath = `ledger/events/2025/01/.pending-${CREATE_ID}.tmp`;
  const finalPath = `ledger/events/2025/01/${CREATE_ID}.json`;
  const conflicting = JSON.stringify({ ...created, name: "Conflicting account" }, null, 2);
  await memory.inject(pendingPath, conflicting);
  await assert.rejects(() => store.appendEvent(created), /pending file conflicts with the event being written/);
  assert.equal(memory.readText(pendingPath), conflicting);
  assert.equal(memory.getAbstractFileByPath(finalPath), null);
});

test("event store preserves a truncated pending file and does not create a final event", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await store.initialize();
  const pendingPath = `ledger/events/2025/01/.pending-${CREATE_ID}.tmp`;
  const finalPath = `ledger/events/2025/01/${CREATE_ID}.json`;
  await memory.inject(pendingPath, "{broken");
  await assert.rejects(() => store.appendEvent(created), /pending file is damaged or not fully downloaded/);
  assert.equal(memory.readText(pendingPath), "{broken");
  assert.equal(memory.getAbstractFileByPath(finalPath), null);
});

test("concurrent initialization shares one in-flight operation", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await Promise.all([store.initialize(), store.initialize(), store.initialize()]);
  assert.equal(memory.readText("ledger/ledger-meta.json").includes("immutable-events"), true);
});

test("event store fails closed when an event file is truncated", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  await store.initialize();
  await memory.inject("ledger/events/2025/01/30000000-0000-4000-8000-000000000001.json", "{broken");
  await assert.rejects(() => store.loadSnapshot(), /damaged/);
  await assert.rejects(() => store.appendEvent(created), /read-only/);
});

test("JSON export carries currency and imports idempotently", async () => {
  const sourceMemory = new MemoryVault();
  const source = new LedgerEventStore(sourceMemory.asVault(), "ledger");
  await source.appendEvents([created, flow]);
  const exportPath = await source.exportJson("SGD");
  const payload = sourceMemory.readText(exportPath);
  assert.match(payload, /"baseCurrency": "SGD"/);

  const targetMemory = new MemoryVault();
  const target = new LedgerEventStore(targetMemory.asVault(), "ledger");
  assert.equal(await target.importJson(payload, "SGD"), 2);
  assert.equal(await target.importJson(payload, "SGD"), 0);
  await assert.rejects(() => target.importJson(payload, "USD"), /supported Investment Tracker export/);
});

test("CSV export neutralizes spreadsheet formulas in user text", async () => {
  const memory = new MemoryVault();
  const store = new LedgerEventStore(memory.asVault(), "ledger");
  const unsafeAccount: LedgerEvent = { ...created, name: "=HYPERLINK(\"bad\")" };
  const unsafeFlow: LedgerEvent = { ...flow, note: "+SUM(1,1)" };
  await store.appendEvents([unsafeAccount, unsafeFlow]);
  const path = await store.exportCsv();
  const csv = memory.readText(path);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+SUM/);
});
