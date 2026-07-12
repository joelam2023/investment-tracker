import { TFile, TFolder, normalizePath } from "obsidian";
import type { Vault } from "obsidian";
import type {
  AccountState,
  BenchmarkId,
  Currency,
  LedgerEvent,
  LedgerSnapshot,
} from "../types";
import { SUPPORTED_CURRENCIES } from "../types";
import { parseMoneyStrict } from "../domain/money";
import type { LedgerSecurityState } from "../types";
import {
  createLedgerSecurity,
  decryptEventText,
  encryptEventText,
  parseEncryptedEnvelope,
  parseEncryptedMeta,
  rewrapPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
  type EncryptedLedgerMeta,
} from "../security/crypto";
import { t } from "../i18n";

interface RawLedgerRead {
  events: LedgerEvent[];
  warnings: string[];
  fatalErrors: string[];
}

export interface AppendBatchResult {
  writtenIds: string[];
  existingIds: string[];
}

export class LedgerBatchError extends Error {
  constructor(message: string, readonly writtenIds: string[]) {
    super(message);
    this.name = "LedgerBatchError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

function isBenchmark(value: unknown): value is BenchmarkId {
  return value === "sp500" || value === "none";
}

function assertOptionalString(value: unknown, label: string, maxLength = 5000): void {
  if (value !== undefined && (typeof value !== "string" || value.length > maxLength)) {
    throw new Error(t("{label} has an invalid format", { label }));
  }
}

export function validateLedgerEvent(value: unknown): LedgerEvent {
  if (!isRecord(value)) throw new Error(t("Record is not a JSON object"));
  if (value.schemaVersion !== 1) throw new Error(t("Unsupported record version"));
  if (!isUuid(value.eventId)) throw new Error(t("eventId must be a standard UUID"));
  if (!isTimestamp(value.recordedAt)) throw new Error(t("recordedAt has an invalid format"));
  if (!isIsoDate(value.effectiveDate)) throw new Error(t("effectiveDate has an invalid format"));
  if (value.supersedesEventId !== undefined && !isUuid(value.supersedesEventId)) {
    throw new Error(t("supersedesEventId has an invalid format"));
  }
  if (typeof value.type !== "string") throw new Error(t("Record type is missing"));

  if (value.type === "event-voided") {
    if (value.supersedesEventId !== undefined) throw new Error(t("A void event cannot supersede another event"));
    if (!isUuid(value.targetEventId)) throw new Error(t("Invalid void target"));
    assertOptionalString(value.reason, t("Void reason"));
    return {
      schemaVersion: 1,
      type: "event-voided",
      eventId: value.eventId,
      recordedAt: value.recordedAt,
      effectiveDate: value.effectiveDate,
      targetEventId: value.targetEventId,
      ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    };
  }

  if (!isUuid(value.accountId)) throw new Error(t("accountId must be a standard UUID"));
  if (value.type === "account-created") {
    if (value.supersedesEventId !== undefined) throw new Error(t("An account creation event cannot supersede another event"));
    if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 160) {
      throw new Error(t("Invalid account name"));
    }
    if (!isCurrency(value.currency)) throw new Error(t("Invalid account currency"));
    if (!isBenchmark(value.benchmarkId)) throw new Error(t("Invalid account benchmark"));
    return {
      schemaVersion: 1,
      type: "account-created",
      eventId: value.eventId,
      recordedAt: value.recordedAt,
      effectiveDate: value.effectiveDate,
      accountId: value.accountId,
      name: value.name,
      currency: value.currency,
      benchmarkId: value.benchmarkId,
    };
  }
  if (value.type === "account-updated") {
    if (value.supersedesEventId !== undefined) throw new Error(t("An account update event cannot supersede another event"));
    if (value.name !== undefined && (typeof value.name !== "string" || !value.name.trim() || value.name.length > 160)) {
      throw new Error(t("Invalid account name"));
    }
    if (value.benchmarkId !== undefined && !isBenchmark(value.benchmarkId)) throw new Error(t("Invalid account benchmark"));
    if (value.archived !== undefined && typeof value.archived !== "boolean") throw new Error(t("Invalid archive status"));
    return {
      schemaVersion: 1,
      type: "account-updated",
      eventId: value.eventId,
      recordedAt: value.recordedAt,
      effectiveDate: value.effectiveDate,
      accountId: value.accountId,
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(isBenchmark(value.benchmarkId) ? { benchmarkId: value.benchmarkId } : {}),
      ...(typeof value.archived === "boolean" ? { archived: value.archived } : {}),
    };
  }
  if (value.type === "cash-flow") {
    if (value.direction !== "contribution" && value.direction !== "withdrawal") throw new Error(t("Invalid cash-flow direction"));
    if (!isCurrency(value.currency)) throw new Error(t("Invalid cash-flow currency"));
    if (typeof value.amount !== "string" || parseMoneyStrict(value.amount, value.currency) <= 0) throw new Error(t("Invalid cash-flow amount"));
    assertOptionalString(value.note, t("Note"));
    return {
      schemaVersion: 1,
      type: "cash-flow",
      eventId: value.eventId,
      recordedAt: value.recordedAt,
      effectiveDate: value.effectiveDate,
      accountId: value.accountId,
      direction: value.direction,
      amount: value.amount,
      currency: value.currency,
      ...(typeof value.note === "string" ? { note: value.note } : {}),
      ...(typeof value.supersedesEventId === "string" ? { supersedesEventId: value.supersedesEventId } : {}),
    };
  }
  if (value.type === "valuation") {
    if (typeof value.totalValue !== "string") throw new Error(t("Invalid valuation amount"));
    if (!isCurrency(value.currency)) throw new Error(t("Invalid valuation currency"));
    parseMoneyStrict(value.totalValue, value.currency);
    assertOptionalString(value.note, t("Note"));
    return {
      schemaVersion: 1,
      type: "valuation",
      eventId: value.eventId,
      recordedAt: value.recordedAt,
      effectiveDate: value.effectiveDate,
      accountId: value.accountId,
      totalValue: value.totalValue,
      currency: value.currency,
      ...(typeof value.note === "string" ? { note: value.note } : {}),
      ...(typeof value.supersedesEventId === "string" ? { supersedesEventId: value.supersedesEventId } : {}),
    };
  }
  throw new Error(t("Unknown record type: {type}", { type: value.type }));
}

function sortEvents(events: LedgerEvent[]): LedgerEvent[] {
  return [...events].sort(
    (a, b) =>
      a.recordedAt.localeCompare(b.recordedAt) ||
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.eventId.localeCompare(b.eventId),
  );
}

export function rebuildLedgerSnapshot(inputEvents: LedgerEvent[], initialWarnings: string[] = []): LedgerSnapshot {
  const warnings = [...initialWarnings];
  const unique = new Map<string, LedgerEvent>();
  for (const event of sortEvents(inputEvents)) {
    if (unique.has(event.eventId)) {
      const prior = unique.get(event.eventId);
      if (!prior || !jsonEqual(prior, event)) {
        throw new Error(t("Conflicting duplicate eventId found: {eventId}", { eventId: event.eventId }));
      }
      warnings.push(t("Identical duplicate eventId safely deduplicated: {eventId}", { eventId: event.eventId }));
      continue;
    }
    unique.set(event.eventId, event);
  }
  const ordered = sortEvents([...unique.values()]);
  const eventById = new Map(ordered.map((event) => [event.eventId, event]));
  const voided = new Set<string>();
  const superseded = new Set<string>();
  for (const event of ordered) {
    if (event.type === "event-voided") {
      const target = eventById.get(event.targetEventId);
      if (!target) throw new Error(t("Void event target not found: {eventId}", { eventId: event.eventId }));
      if (target.type !== "cash-flow" && target.type !== "valuation") {
        throw new Error(t("Only cash-flow or valuation records can be voided: {eventId}", { eventId: event.eventId }));
      }
      voided.add(event.targetEventId);
    }
  }
  const replacementByTarget = new Map<string, LedgerEvent>();
  for (const event of ordered) {
    if (!event.supersedesEventId) continue;
    if (event.type !== "cash-flow" && event.type !== "valuation") {
      throw new Error(t("Only cash-flow or valuation records can be corrected: {eventId}", { eventId: event.eventId }));
    }
    const target = eventById.get(event.supersedesEventId);
    if (!target) throw new Error(t("Original record for correction not found: {eventId}", { eventId: event.eventId }));
    if (target.type !== event.type || target.accountId !== event.accountId || target.currency !== event.currency) {
      throw new Error(t("Correction does not match the original record's type, account, or currency: {eventId}", { eventId: event.eventId }));
    }
    if (voided.has(target.eventId)) throw new Error(t("A voided record cannot be corrected: {eventId}", { eventId: event.eventId }));
    const existingReplacement = replacementByTarget.get(target.eventId);
    if (existingReplacement) {
      throw new Error(t("Multiple concurrent corrections exist for the same record; manual review is required: {eventId}", { eventId: target.eventId }));
    }
    replacementByTarget.set(target.eventId, event);
    superseded.add(target.eventId);
  }
  const effective = ordered.filter(
    (event) => event.type !== "event-voided" && !voided.has(event.eventId) && !superseded.has(event.eventId),
  );

  const accounts = new Map<string, AccountState>();
  const stateEvents = [...effective].sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.recordedAt.localeCompare(b.recordedAt) ||
      a.eventId.localeCompare(b.eventId),
  );
  for (const event of stateEvents) {
    if (event.type === "account-created") {
      if (accounts.has(event.accountId)) {
        warnings.push(t("Account has multiple creation records; later records were ignored: {accountId}", { accountId: event.accountId }));
        continue;
      }
      accounts.set(event.accountId, {
        accountId: event.accountId,
        name: event.name,
        currency: event.currency,
        benchmarkId: event.benchmarkId,
        openedOn: event.effectiveDate,
        archived: false,
      });
    } else if (event.type === "account-updated") {
      const current = accounts.get(event.accountId);
      if (!current) {
        warnings.push(t("Account update references an account that was not found: {accountId}", { accountId: event.accountId }));
        continue;
      }
      accounts.set(event.accountId, {
        ...current,
        ...(event.name === undefined ? {} : { name: event.name }),
        ...(event.benchmarkId === undefined ? {} : { benchmarkId: event.benchmarkId }),
        ...(event.archived === undefined ? {} : { archived: event.archived }),
      });
    }
  }
  for (const event of effective) {
    if (
      (event.type === "cash-flow" || event.type === "valuation") &&
      !accounts.has(event.accountId)
    ) {
      warnings.push(t("Record references an account that does not exist: {eventId}", { eventId: event.eventId }));
    }
  }
  return {
    accounts: [...accounts.values()].sort((a, b) => a.openedOn.localeCompare(b.openedOn) || a.name.localeCompare(b.name)),
    events: effective,
    warnings,
  };
}

function jsonEqual(a: LedgerEvent, b: LedgerEvent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function csvSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function exportTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace("Z", "").replace(".", "-");
}

export class LedgerEventStore {
  private readonly basePath: string;
  private initializationPromise: Promise<void> | null = null;
  private ledgerKey: CryptoKey | null = null;
  private encryptedMeta: EncryptedLedgerMeta | null = null;

  constructor(private readonly vault: Vault, basePath: string) {
    this.basePath = normalizePath(basePath);
  }

  lock(): void {
    this.ledgerKey = null;
  }

  async getSecurityState(): Promise<LedgerSecurityState> {
    await this.initialize();
    const meta = await this.readMeta();
    if (meta.schemaVersion === 1) return "setup-required";
    return this.ledgerKey ? "unlocked" : "locked";
  }

  async unlock(secret: string, mode: "password" | "recovery"): Promise<void> {
    await this.initialize();
    const meta = parseEncryptedMeta(await this.readMeta());
    this.ledgerKey = mode === "password"
      ? await unlockWithPassword(meta, secret)
      : await unlockWithRecoveryKey(meta, secret);
    this.encryptedMeta = meta;
  }

  async verifyPassword(password: string): Promise<void> {
    const meta = parseEncryptedMeta(await this.readMeta());
    await unlockWithPassword(meta, password);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const meta = parseEncryptedMeta(await this.readMeta());
    const key = await unlockWithPassword(meta, currentPassword);
    const next = await rewrapPassword(meta, key, newPassword);
    await this.writeMeta(next);
    this.ledgerKey = key;
    this.encryptedMeta = next;
  }

  async enableEncryption(password: string): Promise<{ recoveryKey: string; eventCount: number; plaintextRemoved: boolean }> {
    await this.initialize();
    const currentMeta = await this.readMeta();
    if (currentMeta.schemaVersion !== 1) throw new Error(t("Ledger encryption is already enabled"));
    const raw = await this.readRawEvents(false);
    if (raw.fatalErrors.length > 0) throw new Error(t("Migration stopped: {message}", { message: raw.fatalErrors[0] ?? "" }));
    rebuildLedgerSnapshot(raw.events, raw.warnings);

    const { meta, ledgerKey, recoveryKey } = await createLedgerSecurity(password);
    const eventsPath = normalizePath(`${this.basePath}/events`);
    const stagingPath = normalizePath(`${this.basePath}/events-encrypted-staging`);
    const plaintextBackupPath = normalizePath(`${this.basePath}/events-plaintext-migration-backup`);
    if (this.vault.getAbstractFileByPath(stagingPath) || this.vault.getAbstractFileByPath(plaintextBackupPath)) {
      throw new Error(t("An unfinished migration folder was found; migration stopped to avoid overwriting data"));
    }
    await this.vault.createFolder(stagingPath);
    try {
      const sourcePrefix = `${eventsPath}/`;
      const sourceFiles = this.vault.getFiles()
        .filter((file) => file.path.startsWith(sourcePrefix) && file.extension.toLowerCase() === "json")
        .sort((a, b) => a.path.localeCompare(b.path));
      for (const file of sourceFiles) {
        const event = validateLedgerEvent(JSON.parse(await this.vault.read(file)) as unknown);
        const targetPath = normalizePath(`${stagingPath}/${event.eventId.slice(0, 2)}/${event.eventId}.json`);
        await this.ensureFolder(targetPath.split("/").slice(0, -1).join("/"));
        const encrypted = await encryptEventText(ledgerKey, JSON.stringify(event));
        const created = await this.vault.create(targetPath, encrypted);
        const decrypted = await decryptEventText(ledgerKey, parseEncryptedEnvelope(JSON.parse(await this.vault.read(created))));
        const verified = validateLedgerEvent(JSON.parse(decrypted) as unknown);
        if (!jsonEqual(event, verified)) throw new Error(t("Encrypted write verification failed: {path}", { path: file.path }));
      }
      const stagedFiles = this.vault.getFiles().filter((file) => file.path.startsWith(`${stagingPath}/`));
      if (stagedFiles.length !== sourceFiles.length) throw new Error(t("Encrypted event count verification failed"));
      const originalFolder = this.vault.getAbstractFileByPath(eventsPath);
      const stagingFolder = this.vault.getAbstractFileByPath(stagingPath);
      if (!(originalFolder instanceof TFolder) || !(stagingFolder instanceof TFolder)) {
        throw new Error(t("Migration folder is unavailable"));
      }
      await this.vault.rename(originalFolder, plaintextBackupPath);
      try {
        await this.vault.rename(stagingFolder, eventsPath);
        await this.writeMeta(meta);
      } catch (error) {
        const encryptedFolder = this.vault.getAbstractFileByPath(eventsPath);
        if (encryptedFolder instanceof TFolder) await this.vault.rename(encryptedFolder, stagingPath);
        const backupFolder = this.vault.getAbstractFileByPath(plaintextBackupPath);
        if (backupFolder instanceof TFolder) await this.vault.rename(backupFolder, eventsPath);
        throw error;
      }
      this.ledgerKey = ledgerKey;
      this.encryptedMeta = meta;
      let plaintextRemoved = false;
      const backupFolder = this.vault.getAbstractFileByPath(plaintextBackupPath);
      if (backupFolder instanceof TFolder) {
        try {
          // Permanent deletion is intentional: trashing this verified migration backup would retain plaintext financial data.
          await this.vault.delete(backupFolder, true);
          plaintextRemoved = true;
        } catch {
          plaintextRemoved = false;
        }
      }
      const verified = await this.readRawEvents(false);
      if (verified.fatalErrors.length > 0 || verified.events.length !== raw.events.length) {
        throw new Error(t("Final verification after encryption migration failed; keep an external backup and stop adding records"));
      }
      return { recoveryKey, eventCount: verified.events.length, plaintextRemoved };
    } catch (error) {
      const stagingFolder = this.vault.getAbstractFileByPath(stagingPath);
      if (stagingFolder instanceof TFolder) await this.vault.delete(stagingFolder, true);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce().catch((error: unknown) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  private async initializeOnce(): Promise<void> {
    for (const path of [
      this.basePath,
      `${this.basePath}/events`,
      `${this.basePath}/market-cache`,
      `${this.basePath}/backups`,
      `${this.basePath}/exports`,
    ]) {
      await this.ensureFolder(path);
    }
    const metaPath = normalizePath(`${this.basePath}/ledger-meta.json`);
    const existing = this.vault.getAbstractFileByPath(metaPath);
    if (!existing) {
      const hasExistingEvents = this.vault
        .getFiles()
        .some((file) => file.path.startsWith(normalizePath(`${this.basePath}/events/`)));
      if (hasExistingEvents) throw new Error(t("Ledger event files exist but ledger-meta.json is missing; writing stopped"));
      const content = JSON.stringify({ schemaVersion: 1, format: "investment-tracker-immutable-events" }, null, 2);
      try {
        await this.vault.create(metaPath, content);
      } catch (error) {
        const raced = this.vault.getAbstractFileByPath(metaPath);
        if (!(raced instanceof TFile)) throw error;
        await this.assertValidMeta(raced);
      }
    } else if (existing instanceof TFile) {
      await this.assertValidMeta(existing);
    } else {
      throw new Error(t("The ledger-meta.json path is occupied by a folder; writing stopped"));
    }
  }

  async appendEvent(input: LedgerEvent): Promise<boolean> {
    const event = validateLedgerEvent(input);
    await this.initialize();
    const raw = await this.readRawEvents(false);
    if (raw.fatalErrors.length > 0) {
      throw new Error(t("The ledger contains an unreadable event and is now read-only: {message}", {
        message: raw.fatalErrors[0] ?? "",
      }));
    }
    rebuildLedgerSnapshot(raw.events, raw.warnings);
    const duplicate = raw.events.find((candidate) => candidate.eventId === event.eventId);
    if (duplicate) {
      if (!jsonEqual(duplicate, event)) throw new Error(t("eventId conflict; new record was not written: {eventId}", { eventId: event.eventId }));
      return false;
    }
    const meta = await this.readMeta();
    const folder = meta.schemaVersion === 2
      ? normalizePath(`${this.basePath}/events/${event.eventId.slice(0, 2)}`)
      : normalizePath(`${this.basePath}/events/${event.effectiveDate.slice(0, 4)}/${event.effectiveDate.slice(5, 7)}`);
    await this.ensureFolder(folder);
    const path = normalizePath(`${folder}/${event.eventId}.json`);
    const content = await this.encodeEvent(event);
    const tempPath = normalizePath(`${this.basePath}/backups/pending-${event.eventId}.json`);
    const legacyTempPath = normalizePath(`${folder}/.pending-${event.eventId}.tmp`);
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      let prior: LedgerEvent;
      try {
        prior = await this.decodeEvent(await this.vault.read(existing));
      } catch {
        throw new Error(t("Target event file is damaged; writing stopped and the file will not be overwritten: {path}", { path }));
      }
      if (!jsonEqual(prior, event)) throw new Error(t("eventId conflict; original record was not overwritten: {eventId}", { eventId: event.eventId }));
      const indexedPending = this.vault.getAbstractFileByPath(tempPath);
      if (indexedPending instanceof TFile) {
        const pending = await this.decodeEvent(await this.vault.read(indexedPending));
        if (!jsonEqual(pending, event)) throw new Error(t("Pending file conflicts with the written event; cleanup stopped: {path}", { path: tempPath }));
        await this.vault.delete(indexedPending, true);
      } else if (!indexedPending && (await this.vault.adapter.exists(tempPath))) {
        const pending = await this.decodeEvent(await this.vault.adapter.read(tempPath));
        if (!jsonEqual(pending, event)) throw new Error(t("Pending file conflicts with the written event; cleanup stopped: {path}", { path: tempPath }));
        await this.vault.adapter.remove(tempPath);
      }
      if (await this.vault.adapter.exists(legacyTempPath)) {
        const pending = await this.decodeEvent(await this.vault.adapter.read(legacyTempPath));
        if (!jsonEqual(pending, event)) {
          throw new Error(t("Legacy pending file conflicts with the written event; cleanup stopped: {path}", { path: legacyTempPath }));
        }
        await this.vault.adapter.remove(legacyTempPath);
      }
      return false;
    }
    if (existing) throw new Error(t("Record path is occupied by a folder: {path}", { path }));
    const legacyTemp = this.vault.getAbstractFileByPath(legacyTempPath);
    if (legacyTemp && !(legacyTemp instanceof TFile)) {
      throw new Error(t("Legacy pending path is occupied by a folder; writing stopped: {path}", { path: legacyTempPath }));
    }
    if (legacyTemp instanceof TFile || (await this.vault.adapter.exists(legacyTempPath))) {
      let stagedText: string;
      let staged: LedgerEvent;
      try {
        stagedText = await this.vault.adapter.read(legacyTempPath);
        staged = await this.decodeEvent(stagedText);
      } catch {
        throw new Error(t("Legacy pending file is damaged or not fully downloaded; writing stopped: {path}", { path: legacyTempPath }));
      }
      if (!jsonEqual(staged, event)) {
        throw new Error(t("Legacy pending file conflicts with the event being written; writing stopped: {path}", { path: legacyTempPath }));
      }
      const recovered = await this.vault.create(path, stagedText);
      const finalEvent = await this.decodeEvent(await this.vault.read(recovered));
      if (!jsonEqual(finalEvent, event)) throw new Error(t("Final verification failed after restoring an event from a legacy pending file"));
      await this.vault.adapter.remove(legacyTempPath);
      return true;
    }
    const staleTemp = this.vault.getAbstractFileByPath(tempPath);
    if (staleTemp && !(staleTemp instanceof TFile)) {
      throw new Error(t("Pending path is occupied by a folder; writing stopped: {path}", { path: tempPath }));
    }
    if (!staleTemp && (await this.vault.adapter.exists(tempPath))) {
      let stagedText: string;
      let staged: LedgerEvent;
      try {
        stagedText = await this.vault.adapter.read(tempPath);
        staged = await this.decodeEvent(stagedText);
      } catch {
        throw new Error(t("Unindexed pending file is damaged or not fully downloaded; writing stopped: {path}", { path: tempPath }));
      }
      if (!jsonEqual(staged, event)) {
        throw new Error(t("Unindexed pending file conflicts with the event being written; writing stopped: {path}", { path: tempPath }));
      }
      const recovered = await this.vault.create(path, stagedText);
      const finalEvent = await this.decodeEvent(await this.vault.read(recovered));
      if (!jsonEqual(finalEvent, event)) throw new Error(t("Final event file verification failed after recovery"));
      await this.vault.adapter.remove(tempPath);
      return true;
    }
    let temp: TFile;
    if (staleTemp instanceof TFile) {
      let staged: LedgerEvent;
      try {
        staged = await this.decodeEvent(await this.vault.read(staleTemp));
      } catch {
        throw new Error(t("Pending file is damaged or not fully downloaded; writing stopped: {path}", { path: tempPath }));
      }
      if (!jsonEqual(staged, event)) {
        throw new Error(t("Pending file conflicts with the event being written; writing stopped: {path}", { path: tempPath }));
      }
      temp = staleTemp;
    } else {
      temp = await this.vault.create(tempPath, content);
    }
    try {
      const reread = await this.decodeEvent(await this.vault.read(temp));
      if (!jsonEqual(reread, event)) throw new Error(t("Pending record verification failed after writing"));
      await this.vault.rename(temp, path);
      const finalFile = this.vault.getAbstractFileByPath(path);
      if (!(finalFile instanceof TFile)) throw new Error(t("Event file is not visible after renaming"));
      const finalEvent = await this.decodeEvent(await this.vault.read(finalFile));
      if (!jsonEqual(finalEvent, event)) throw new Error(t("Final event file verification failed"));
      return true;
    } catch (error) {
      const finalFile = this.vault.getAbstractFileByPath(path);
      if (finalFile instanceof TFile) {
        try {
          const prior = await this.decodeEvent(await this.vault.read(finalFile));
          if (jsonEqual(prior, event)) {
            const pending = this.vault.getAbstractFileByPath(tempPath);
            if (pending instanceof TFile) await this.vault.delete(pending, true);
            return false;
          }
        } catch {
          // Fall through: never overwrite a damaged final event.
        }
      }
      throw error;
    }
  }

  async appendEvents(events: LedgerEvent[]): Promise<AppendBatchResult> {
    const validated = events.map(validateLedgerEvent);
    const result: AppendBatchResult = { writtenIds: [], existingIds: [] };
    try {
      for (const event of validated) {
        const created = await this.appendEvent(event);
        (created ? result.writtenIds : result.existingIds).push(event.eventId);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Batch write failed");
      throw new LedgerBatchError(
        result.writtenIds.length > 0
          ? t("{message}; {count} records were written safely. Retrying the same operation will not create duplicates", {
              message,
              count: result.writtenIds.length,
            })
          : message,
        result.writtenIds,
      );
    }
  }

  async loadSnapshot(): Promise<LedgerSnapshot> {
    const raw = await this.readRawEvents();
    if (raw.fatalErrors.length > 0) {
      throw new Error(t("The ledger contains a damaged, conflicting, or incomplete event: {message}", {
        message: raw.fatalErrors[0] ?? "",
      }));
    }
    return rebuildLedgerSnapshot(raw.events, raw.warnings);
  }

  async readRawEvents(initialize = true): Promise<RawLedgerRead> {
    if (initialize) await this.initialize();
    const prefix = normalizePath(`${this.basePath}/events/`);
    const files = this.vault
      .getFiles()
      .filter((file) => file.path.startsWith(prefix) && file.extension.toLowerCase() === "json")
      .sort((a, b) => a.path.localeCompare(b.path));
    const events: LedgerEvent[] = [];
    const warnings: string[] = [];
    const fatalErrors: string[] = [];
    for (const file of files) {
      try {
        const content = await this.vault.read(file);
        events.push(await this.decodeEvent(content));
      } catch (error) {
        const detail = error instanceof Error ? error.message : t("Unable to read");
        fatalErrors.push(t("{path}: {message}", { path: file.path, message: detail }));
      }
    }
    return { events, warnings, fatalErrors };
  }

  async exportJson(baseCurrency: Currency): Promise<string> {
    const raw = await this.readRawEvents();
    if (raw.fatalErrors.length > 0) {
      throw new Error(t("Complete backup stopped because an event could not be read: {message}", {
        message: raw.fatalErrors[0] ?? "",
      }));
    }
    rebuildLedgerSnapshot(raw.events, raw.warnings);
    const payload = {
      format: "investment-tracker-export",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: { baseCurrency },
      events: sortEvents(raw.events),
    };
    return this.writeExport(`investment-tracker-${exportTimestamp()}.json`, JSON.stringify(payload, null, 2));
  }

  async exportCsv(): Promise<string> {
    const snapshot = await this.loadSnapshot();
    const accountNames = new Map(snapshot.accounts.map((account) => [account.accountId, account.name]));
    const rows: string[][] = [[
      "effective_date",
      "type",
      "account_id",
      "account_name",
      "direction",
      "amount",
      "currency",
      "note",
      "event_id",
    ]];
    for (const event of snapshot.events) {
      if (event.type !== "cash-flow" && event.type !== "valuation") continue;
      rows.push([
        event.effectiveDate,
        event.type,
        event.accountId,
        accountNames.get(event.accountId) ?? "",
        event.type === "cash-flow" ? event.direction : "",
        event.type === "cash-flow" ? event.amount : event.totalValue,
        event.currency,
        event.note ?? "",
        event.eventId,
      ].map(csvSafe));
    }
    const content = `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
    return this.writeExport(`investment-tracker-${exportTimestamp()}.csv`, content);
  }

  async importJson(payload: string, expectedCurrency: Currency): Promise<number> {
    if (payload.length > 10_000_000) throw new Error(t("Import file exceeds the 10 MB limit"));
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      throw new Error(t("Invalid JSON format"));
    }
    if (
      !isRecord(parsed) ||
      parsed.format !== "investment-tracker-export" ||
      parsed.schemaVersion !== 1 ||
      !isRecord(parsed.settings) ||
      parsed.settings.baseCurrency !== expectedCurrency ||
      !Array.isArray(parsed.events)
    ) {
      throw new Error(t("This is not a supported Investment Tracker export file"));
    }
    if (parsed.events.length > 100_000) throw new Error(t("Import exceeds the limit of 100,000 events"));
    const events = parsed.events.map(validateLedgerEvent);
    rebuildLedgerSnapshot(events);
    const result = await this.appendEvents(events);
    return result.writtenIds.length;
  }

  getMarketCachePath(currency: Currency): string {
    return normalizePath(`${this.basePath}/market-cache/sp500-${currency.toLowerCase()}.json`);
  }

  private async writeExport(fileName: string, content: string): Promise<string> {
    await this.initialize();
    const path = normalizePath(`${this.basePath}/exports/${fileName}`);
    if (this.vault.getAbstractFileByPath(path)) throw new Error(t("Export file already exists: {path}", { path }));
    await this.vault.create(path, content);
    return path;
  }

  private async encodeEvent(event: LedgerEvent): Promise<string> {
    const meta = await this.readMeta();
    if (meta.schemaVersion === 1) return JSON.stringify(event, null, 2);
    if (!this.ledgerKey) throw new Error(t("Investment ledger is locked"));
    return encryptEventText(this.ledgerKey, JSON.stringify(event));
  }

  private async decodeEvent(content: string): Promise<LedgerEvent> {
    const parsed = JSON.parse(content) as unknown;
    if ((parsed as { schemaVersion?: unknown })?.schemaVersion === 1) return validateLedgerEvent(parsed);
    if (!this.ledgerKey) throw new Error(t("Investment ledger is locked"));
    const plaintext = await decryptEventText(this.ledgerKey, parseEncryptedEnvelope(parsed));
    return validateLedgerEvent(JSON.parse(plaintext) as unknown);
  }

  private async readMeta(): Promise<Record<string, unknown> | EncryptedLedgerMeta> {
    const path = normalizePath(`${this.basePath}/ledger-meta.json`);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(t("ledger-meta.json does not exist or its path is invalid"));
    try {
      const parsed = JSON.parse(await this.vault.read(file)) as unknown;
      if (!isRecord(parsed)) throw new Error(t("Not a JSON object"));
      return parsed;
    } catch {
      throw new Error(t("ledger-meta.json is damaged or not fully downloaded; writing stopped"));
    }
  }

  private async writeMeta(meta: EncryptedLedgerMeta): Promise<void> {
    const path = normalizePath(`${this.basePath}/ledger-meta.json`);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(t("ledger-meta.json does not exist or its path is invalid"));
    await this.vault.process(file, () => JSON.stringify(meta, null, 2));
    parseEncryptedMeta(JSON.parse(await this.vault.read(file)) as unknown);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const segments = normalized.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.vault.getAbstractFileByPath(current);
      if (!existing) {
        try {
          await this.vault.createFolder(current);
        } catch (error) {
          if (!this.vault.getAbstractFileByPath(current)) throw error;
        }
      } else if (existing instanceof TFile) {
        throw new Error(t("A folder is required, but the path is occupied by a file: {path}", { path: current }));
      }
    }
  }

  private async assertValidMeta(file: TFile): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await this.vault.read(file)) as unknown;
    } catch {
      throw new Error(t("ledger-meta.json is damaged or not fully downloaded; writing stopped"));
    }
    if (!isRecord(parsed)) {
      throw new Error(t("ledger-meta.json has an unsupported format or version; writing stopped"));
    }
    if (parsed.schemaVersion === 1 && parsed.format === "investment-tracker-immutable-events") return;
    try {
      this.encryptedMeta = parseEncryptedMeta(parsed);
    } catch {
      throw new Error(t("ledger-meta.json has an unsupported format or version; writing stopped"));
    }
  }
}
