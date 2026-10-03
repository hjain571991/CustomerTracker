/**
 * The owner PIN.
 *
 * Precedence: a PIN the owner set in the app (this device) > `VITE_OWNER_PIN`
 * from the build > the shipped default. Storing it per-device means a phone in
 * the shop can have its own PIN without a rebuild.
 *
 * This gate keeps shop staff out of the owner screens on a shared phone. It is
 * not a security boundary: the check runs in the browser, and clearing site
 * data resets it to the default.
 */

const KEY = "cvt.pin.v1";

export const PIN_LENGTH = 4;
export const DEFAULT_PIN = "1234";

export const isValidPin = (value) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value || "");

/** The PIN currently in force. */
export function loadPin(envPin) {
  let stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // Private mode or blocked storage — fall through to the build-time PIN.
  }
  if (isValidPin(stored)) return stored;
  if (isValidPin(envPin)) return envPin;
  return DEFAULT_PIN;
}

/** Persists a new PIN for this device. Returns false if storage refused it. */
export function savePin(pin) {
  if (!isValidPin(pin)) throw new Error(`A PIN must be ${PIN_LENGTH} digits.`);
  try {
    localStorage.setItem(KEY, pin);
    return true;
  } catch {
    return false;
  }
}

/** Drops the device PIN, falling back to the build-time or default one. */
export function clearPin() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** True when the PIN in force is one this device chose, not the shipped one. */
export function hasCustomPin() {
  try {
    return isValidPin(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}
