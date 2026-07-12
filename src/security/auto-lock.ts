import type { AutoLockMinutes } from "../types";

export const AUTO_LOCK_MINUTES = [0, 1, 5, 15, 30] as const satisfies readonly AutoLockMinutes[];
export const PRIVACY_MASK_EVENT = "investment-tracker-privacy-mask";

export function isAutoLockMinutes(value: unknown): value is AutoLockMinutes {
  return typeof value === "number" && (AUTO_LOCK_MINUTES as readonly number[]).includes(value);
}

export function autoLockDelayMs(minutes: AutoLockMinutes): number | null {
  return minutes === 0 ? null : minutes * 60_000;
}

export function hasAutomaticLockRule(lockOnLeave: boolean, minutes: AutoLockMinutes): boolean {
  return lockOnLeave || minutes > 0;
}

export function shouldLockOnPrivacyBoundary(lockOnLeave: boolean): boolean {
  return lockOnLeave;
}

export function hasLockEpochChanged(startedAtEpoch: number, currentEpoch: number): boolean {
  return startedAtEpoch !== currentEpoch;
}
