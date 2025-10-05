import type { Cookies } from '@sveltejs/kit';
import type { CookieParseOptions, CookieSerializeOptions } from 'cookie';

const STORAGE_PREFIX = 'stormhacks:cookie:';

type StorageAdapter = {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  keys: () => string[];
};

const createStorage = (): StorageAdapter => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return {
      get: (key) => window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? undefined,
      set: (key, value) => window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, value),
      remove: (key) => window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`),
      keys: () => {
        const result: string[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const rawKey = window.localStorage.key(index);
          if (!rawKey) continue;
          if (!rawKey.startsWith(STORAGE_PREFIX)) continue;
          result.push(rawKey.slice(STORAGE_PREFIX.length));
        }
        return result;
      }
    };
  }

  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
    keys: () => Array.from(map.keys())
  };
};

interface CookieSerializeOptions {
  path: string;
}

class LocalCookieJar implements Cookies {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  get(name: string, _opts?: CookieParseOptions) {
    return this.storage.get(name);
  }

  getAll(_opts?: CookieParseOptions) {
    const items = this.storage.keys();
    return items
      .map((name) => {
        const value = this.storage.get(name);
        return value === undefined ? null : { name, value };
      })
      .filter((entry): entry is { name: string; value: string } => Boolean(entry));
  }

  set(name: string, value: string, _opts: CookieSerializeOptions) {
    this.storage.set(name, value);
  }

  delete(name: string, _opts: CookieSerializeOptions) {
    this.storage.remove(name);
  }

  serialize(name: string, value: string, _opts: CookieSerializeOptions) {
    this.storage.set(name, value);
    return `${name}=${encodeURIComponent(value)}; path=/`;
  }
}

let jar: LocalCookieJar | null = null;

export const getLocalCookieJar = (): Cookies => {
  if (!jar) {
    jar = new LocalCookieJar(createStorage());
  }
  return jar;
};
