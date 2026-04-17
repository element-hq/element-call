const storage: Record<string, string> = {};
const localStoragePolyfill = {
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(storage, key)
      ? storage[key]
      : null;
  },
  setItem(key: string, value: string) {
    storage[key] = String(value);
  },
  removeItem(key: string) {
    delete storage[key];
  },
  clear() {
    for (const key in storage) {
      delete storage[key];
    }
  },
  key(index: number) {
    const keys = Object.keys(storage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(storage).length;
  },
} as unknown as Storage;

if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.clear !== "function"
) {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStoragePolyfill,
    writable: true,
    configurable: true,
  });
}

if (
  typeof window !== "undefined" &&
  (typeof window.localStorage === "undefined" ||
    typeof window.localStorage.clear !== "function")
) {
  Object.defineProperty(window, "localStorage", {
    value: localStoragePolyfill,
    writable: true,
    configurable: true,
  });
}

import "./src/vitest.setup.ts";
