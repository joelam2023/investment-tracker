import test from "node:test";
import assert from "node:assert/strict";
import {
  createLedgerSecurity,
  decryptEventText,
  encryptEventText,
  parseEncryptedEnvelope,
  rewrapPassword,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from "../src/security/crypto";

test("password and recovery key unlock the same encrypted ledger", async () => {
  const created = await createLedgerSecurity("a-long-test-password");
  const plaintext = JSON.stringify({ account: "synthetic", amount: "12345.67" });
  const envelope = parseEncryptedEnvelope(JSON.parse(await encryptEventText(created.ledgerKey, plaintext)));

  const passwordKey = await unlockWithPassword(created.meta, "a-long-test-password");
  assert.equal(await decryptEventText(passwordKey, envelope), plaintext);

  const recoveryKey = await unlockWithRecoveryKey(created.meta, created.recoveryKey.toLowerCase());
  assert.equal(await decryptEventText(recoveryKey, envelope), plaintext);
  assert.doesNotMatch(JSON.stringify(envelope), /synthetic|12345\.67/);
});

test("wrong credentials cannot unwrap the ledger key", async () => {
  const created = await createLedgerSecurity("correct-password");
  await assert.rejects(() => unlockWithPassword(created.meta, "wrong-password"), /Incorrect password/);
  await assert.rejects(() => unlockWithRecoveryKey(created.meta, "00".repeat(32)), /Incorrect recovery key/);
});

test("changing the password preserves encrypted events and recovery access", async () => {
  const created = await createLedgerSecurity("old-password-value");
  const envelope = parseEncryptedEnvelope(JSON.parse(await encryptEventText(created.ledgerKey, "secret event")));
  const nextMeta = await rewrapPassword(created.meta, created.ledgerKey, "new-password-value");
  await assert.rejects(() => unlockWithPassword(nextMeta, "old-password-value"), /Incorrect password/);
  const nextKey = await unlockWithPassword(nextMeta, "new-password-value");
  assert.equal(await decryptEventText(nextKey, envelope), "secret event");
  const recoveryKey = await unlockWithRecoveryKey(nextMeta, created.recoveryKey);
  assert.equal(await decryptEventText(recoveryKey, envelope), "secret event");
});
