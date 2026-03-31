type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem" | "key" | "length">;

export function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function clearAppStorage() {
  if (typeof window === "undefined") return;

  const prefixes = [
    "overload-",
    "checkin-",
    "notif-sent-",
    "weekly-dismissed-",
    "recovery-checked-",
    "burnout-dismissed-",
  ];

  const clearMatching = (storage: StorageLike) => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => storage.removeItem(key));
  };

  clearMatching(localStorage);
  clearMatching(sessionStorage);
}
