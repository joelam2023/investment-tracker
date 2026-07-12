import { t } from "../i18n";

export const ENCRYPTED_LEDGER_FORMAT = "investment-tracker-encrypted-events" as const;
export const ENCRYPTED_EVENT_FORMAT = "investment-tracker-encrypted-event" as const;
const EVENT_AAD = new TextEncoder().encode("investment-tracker:event:v1");
const KEY_AAD = new TextEncoder().encode("investment-tracker:key:v1");
const CHECK_AAD = new TextEncoder().encode("investment-tracker:check:v1");
const CHECK_TEXT = "investment-tracker-unlocked";
export const PASSWORD_ITERATIONS = 310_000;

export interface CipherBox {
  iv: string;
  ciphertext: string;
}

export interface EncryptedLedgerMeta {
  schemaVersion: 2;
  format: typeof ENCRYPTED_LEDGER_FORMAT;
  encryption: {
    algorithm: "AES-256-GCM";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    passwordWrappedKey: CipherBox;
    recoveryWrappedKey: CipherBox;
    keyCheck: CipherBox;
  };
}

export interface EncryptedEventEnvelope {
  schemaVersion: 2;
  format: typeof ENCRYPTED_EVENT_FORMAT;
  algorithm: "AES-256-GCM";
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", asArrayBuffer(raw), { name: "AES-GCM", length: 256 }, true, usages);
}

async function derivePasswordKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asArrayBuffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptBox(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<CipherBox> {
  const iv = randomBytes(12);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(aad) },
    key,
    asArrayBuffer(plaintext),
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

async function decryptBox(key: CryptoKey, box: CipherBox, aad: Uint8Array): Promise<Uint8Array> {
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(box.iv)), additionalData: asArrayBuffer(aad) },
    key,
    asArrayBuffer(base64ToBytes(box.ciphertext)),
  );
  return new Uint8Array(plaintext);
}

function recoveryBytes(value: string): Uint8Array {
  const normalized = value.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(t("Invalid recovery key format"));
  return Uint8Array.from(normalized.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}

function formatRecoveryKey(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{1,8}/g)!.join("-");
}

export async function createLedgerSecurity(password: string): Promise<{
  meta: EncryptedLedgerMeta;
  ledgerKey: CryptoKey;
  recoveryKey: string;
}> {
  const rawLedgerKey = randomBytes(32);
  const salt = randomBytes(16);
  const recoveryRaw = randomBytes(32);
  const recoveryKey = formatRecoveryKey(recoveryRaw);
  const passwordKey = await derivePasswordKey(password, salt, PASSWORD_ITERATIONS);
  const recoveryWrappingKey = await importAesKey(recoveryRaw, ["encrypt", "decrypt"]);
  const ledgerKey = await importAesKey(rawLedgerKey, ["encrypt", "decrypt"]);
  const meta: EncryptedLedgerMeta = {
    schemaVersion: 2,
    format: ENCRYPTED_LEDGER_FORMAT,
    encryption: {
      algorithm: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: PASSWORD_ITERATIONS,
      salt: bytesToBase64(salt),
      passwordWrappedKey: await encryptBox(passwordKey, rawLedgerKey, KEY_AAD),
      recoveryWrappedKey: await encryptBox(recoveryWrappingKey, rawLedgerKey, KEY_AAD),
      keyCheck: await encryptBox(ledgerKey, new TextEncoder().encode(CHECK_TEXT), CHECK_AAD),
    },
  };
  rawLedgerKey.fill(0);
  recoveryRaw.fill(0);
  return { meta, ledgerKey, recoveryKey };
}

async function assertLedgerKey(meta: EncryptedLedgerMeta, ledgerKey: CryptoKey): Promise<void> {
  const check = new TextDecoder().decode(await decryptBox(ledgerKey, meta.encryption.keyCheck, CHECK_AAD));
  if (check !== CHECK_TEXT) throw new Error(t("Ledger key verification failed"));
}

export async function unlockWithPassword(meta: EncryptedLedgerMeta, password: string): Promise<CryptoKey> {
  try {
    const key = await derivePasswordKey(password, base64ToBytes(meta.encryption.salt), meta.encryption.iterations);
    const raw = await decryptBox(key, meta.encryption.passwordWrappedKey, KEY_AAD);
    const ledgerKey = await importAesKey(raw, ["encrypt", "decrypt"]);
    raw.fill(0);
    await assertLedgerKey(meta, ledgerKey);
    return ledgerKey;
  } catch {
    throw new Error(t("Incorrect password"));
  }
}

export async function unlockWithRecoveryKey(meta: EncryptedLedgerMeta, recoveryKey: string): Promise<CryptoKey> {
  try {
    const rawRecovery = recoveryBytes(recoveryKey);
    const key = await importAesKey(rawRecovery, ["decrypt"]);
    rawRecovery.fill(0);
    const raw = await decryptBox(key, meta.encryption.recoveryWrappedKey, KEY_AAD);
    const ledgerKey = await importAesKey(raw, ["encrypt", "decrypt"]);
    raw.fill(0);
    await assertLedgerKey(meta, ledgerKey);
    return ledgerKey;
  } catch {
    throw new Error(t("Incorrect recovery key"));
  }
}

export async function rewrapPassword(meta: EncryptedLedgerMeta, ledgerKey: CryptoKey, newPassword: string): Promise<EncryptedLedgerMeta> {
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", ledgerKey));
  const salt = randomBytes(16);
  const passwordKey = await derivePasswordKey(newPassword, salt, PASSWORD_ITERATIONS);
  const next = structuredClone(meta);
  next.encryption.salt = bytesToBase64(salt);
  next.encryption.iterations = PASSWORD_ITERATIONS;
  next.encryption.passwordWrappedKey = await encryptBox(passwordKey, raw, KEY_AAD);
  raw.fill(0);
  return next;
}

export async function encryptEventText(ledgerKey: CryptoKey, plaintext: string): Promise<string> {
  const box = await encryptBox(ledgerKey, new TextEncoder().encode(plaintext), EVENT_AAD);
  const envelope: EncryptedEventEnvelope = {
    schemaVersion: 2,
    format: ENCRYPTED_EVENT_FORMAT,
    algorithm: "AES-256-GCM",
    ...box,
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptEventText(ledgerKey: CryptoKey, envelope: EncryptedEventEnvelope): Promise<string> {
  return new TextDecoder().decode(await decryptBox(ledgerKey, envelope, EVENT_AAD));
}

export function parseEncryptedMeta(value: unknown): EncryptedLedgerMeta {
  const meta = value as EncryptedLedgerMeta;
  if (!meta || meta.schemaVersion !== 2 || meta.format !== ENCRYPTED_LEDGER_FORMAT || !meta.encryption) {
    throw new Error(t("Invalid encrypted ledger metadata format"));
  }
  return meta;
}

export function parseEncryptedEnvelope(value: unknown): EncryptedEventEnvelope {
  const envelope = value as EncryptedEventEnvelope;
  if (!envelope || envelope.schemaVersion !== 2 || envelope.format !== ENCRYPTED_EVENT_FORMAT || envelope.algorithm !== "AES-256-GCM") {
    throw new Error(t("Event is not in a supported encrypted format"));
  }
  if (typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new Error(t("Encrypted event fields are missing"));
  }
  return envelope;
}
